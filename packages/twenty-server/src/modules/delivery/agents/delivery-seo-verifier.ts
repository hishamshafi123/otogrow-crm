import axios from 'axios';
import { convert, type DomNode } from 'html-to-text';
import { isIP } from 'net';
import { createSsrfSafeAgent } from 'src/engine/core-modules/secure-http-client/utils/create-ssrf-safe-agent.util';
import { isPrivateIp } from 'src/engine/core-modules/secure-http-client/utils/is-private-ip.util';
import {
  type DeliveryAgentResult,
  type DeliveryAgentInputs,
} from 'src/modules/delivery/agents/delivery-agent.types';

export const validateDeliveryPublicUrl = (value: string): URL => {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    (isIP(hostname) && isPrivateIp(hostname))
  ) {
    throw new Error('Only public HTTP and HTTPS pages are allowed.');
  }
  return url;
};

const nodeText = (node: DomNode): string =>
  node.type === 'text'
    ? (node.data ?? '')
    : (node.children ?? []).map(nodeText).join('');

export const inspectDeliveryBacklinks = (
  html: string,
  sourceUrl: string,
  targetUrl: string,
  anchor?: string,
) => {
  let documentBase = sourceUrl;
  let hasBase = false;
  convert(html, {
    limits: { maxInputLength: 500000, maxDepth: 50, maxChildNodes: 10000 },
    baseElements: { selectors: ['head'], returnDomByDefault: false },
    selectors: [
      { selector: 'head', format: 'inline' },
      { selector: 'base', format: 'captureBase' },
    ],
    formatters: {
      captureBase: (element) => {
        const attributes = element.attribs as
          | Record<string, string>
          | undefined;
        if (hasBase || !attributes?.href) return;
        hasBase = true;
        try {
          documentBase = new URL(attributes.href, sourceUrl).href;
        } catch {
          // Invalid document bases fall back to the fetched URL.
        }
      },
    },
  });
  const links: { href: string; text: string; rel: string }[] = [];
  convert(html, {
    limits: { maxInputLength: 500000, maxDepth: 50, maxChildNodes: 10000 },
    selectors: [{ selector: 'a', format: 'capture' }],
    formatters: {
      capture: (element) => {
        const attributes = element.attribs as
          | Record<string, string>
          | undefined;
        try {
          if (attributes?.href)
            links.push({
              href: new URL(attributes.href, documentBase).href,
              text: nodeText(element).replace(/\s+/g, ' ').trim(),
              rel: attributes.rel ?? '',
            });
        } catch {
          // Malformed links cannot prove a backlink.
        }
      },
    },
  });
  const normalize = (value: string) => {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  };
  return links.filter(
    (link) =>
      normalize(link.href) === normalize(targetUrl) &&
      (!anchor || link.text === anchor.replace(/\s+/g, ' ').trim()),
  );
};

export const fetchDeliveryPublicPage = async (
  value: string,
  signal: AbortSignal,
) => {
  let url = validateDeliveryPublicUrl(value).href;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await axios.get<string>(url, {
      httpAgent: createSsrfSafeAgent('http'),
      httpsAgent: createSsrfSafeAgent('https'),
      proxy: false,
      signal,
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: 500000,
      maxBodyLength: 500000,
      responseType: 'text',
      transformResponse: [(data: string) => data],
      validateStatus: (status) => status >= 200 && status < 400,
    });
    if (response.status >= 300) {
      const location: unknown = response.headers.location;
      if (typeof location !== 'string')
        throw new Error('Redirect has no destination.');
      url = validateDeliveryPublicUrl(new URL(location, url).href).href;
      continue;
    }
    return {
      url,
      body: response.data,
      contentType: String(response.headers['content-type'] ?? ''),
    };
  }
  throw new Error('Too many redirects.');
};

export const verifyDeliverySeo = async (
  inputs: DeliveryAgentInputs,
  signal: AbortSignal,
  fetchPage = fetchDeliveryPublicPage,
): Promise<DeliveryAgentResult> => {
  if (!inputs.sourceUrl || !inputs.targetUrl)
    throw new Error('Source and target URLs are required.');
  validateDeliveryPublicUrl(inputs.sourceUrl);
  validateDeliveryPublicUrl(inputs.targetUrl);
  const at = new Date().toISOString();
  let source: Awaited<ReturnType<typeof fetchPage>>;
  try {
    source = await fetchPage(inputs.sourceUrl, signal);
  } catch {
    return {
      summary: 'Source page inaccessible; backlink could not be verified.',
      findings: [
        {
          severity: 'warning',
          evidence: `${inputs.sourceUrl} checked at ${at}. The request failed, was blocked, or exceeded its limit.`,
          correction:
            'Check public access and retry. This is not evidence that the backlink is missing.',
        },
      ],
      suggestedBrief: null,
      suggestedCopy: null,
    };
  }
  if (!/text\/html|application\/xhtml\+xml/i.test(source.contentType)) {
    return {
      summary: 'Source is not an HTML page; backlink could not be verified.',
      findings: [],
      suggestedBrief: null,
      suggestedCopy: null,
    };
  }
  const links = inspectDeliveryBacklinks(
    source.body,
    source.url,
    inputs.targetUrl,
    inputs.anchor,
  );
  let reachable = false;
  try {
    await fetchPage(inputs.targetUrl, signal);
    reachable = true;
  } catch {
    // Reachability is reported independently from observed links.
  }
  return {
    summary: links.length
      ? 'Backlink observed in fetched HTML.'
      : 'No matching backlink observed in fetched HTML.',
    findings: [
      {
        severity: links.length ? 'info' : 'warning',
        evidence: `${source.url} at ${at}: ${links.length} matching link(s). ${links
          .slice(0, 5)
          .map(
            (link) =>
              `Anchor: ${link.text}; destination: ${link.href}; rel: ${link.rel || 'none'}`,
          )
          .join(' | ')}`,
        correction: links.length
          ? 'This does not prove search indexing or ranking. JavaScript-rendered content is not inspected.'
          : 'Check the exact destination and anchor. JavaScript-rendered content is not inspected; absence here does not prove absence in a browser.',
      },
      {
        severity: reachable ? 'info' : 'warning',
        evidence: `Destination ${inputs.targetUrl}: ${reachable ? 'reachable' : 'inaccessible'}.`,
        correction: reachable
          ? 'Reachability is not proof of indexing.'
          : 'Check destination access or redirects.',
      },
    ],
    suggestedBrief: null,
    suggestedCopy: null,
  };
};
