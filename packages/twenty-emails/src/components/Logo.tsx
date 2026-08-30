import { Img } from 'react-email';

const logoStyle = {
  marginBottom: '40px',
};

// Emails render inside the twenty-server process, so SERVER_URL reflects the
// deployment; the fallback keeps standalone renders (tests, previews) valid.
const LOGO_URL = `${
  process.env.SERVER_URL?.replace(/\/+$/, '') ?? 'https://crm.otogrow.com'
}/images/brand/otogrow-logo-192.png`;

export const Logo = () => {
  return (
    <Img
      src={LOGO_URL}
      alt="Otogrow CRM logo"
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};
