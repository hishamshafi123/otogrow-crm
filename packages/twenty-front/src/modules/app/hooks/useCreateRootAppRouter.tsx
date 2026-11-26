import { lazy, useState } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { LazyRoute } from '@/app/components/LazyRoute';
import { RootAppProviders } from '@/app/components/RootAppProviders';
import { RootAuthorizeRedirect } from '@/app/components/RootAuthorizeRedirect';
import { VerifyEmail } from '@/auth/components/VerifyEmail';
import { OnboardingPageLoader } from '@/onboarding/components/OnboardingPageLoader';
import { OnboardingTransitionOutlet } from '@/onboarding/components/OnboardingTransitionOutlet';
import { AuthFlowLayout } from '@/ui/layout/page/components/AuthFlowLayout';
import { BlankLayout } from '@/ui/layout/page/components/BlankLayout';

const SignInUp = lazy(() =>
  import('~/pages/auth/SignInUp').then((module) => ({
    default: module.SignInUp,
  })),
);

const PasswordReset = lazy(() =>
  import('~/pages/auth/PasswordReset').then((module) => ({
    default: module.PasswordReset,
  })),
);

const PublicLeadForm = lazy(() =>
  import('~/pages/forms/PublicLeadForm').then((module) => ({
    default: module.PublicLeadForm,
  })),
);

const ClientPortalPage = lazy(() =>
  import('~/pages/portal/ClientPortalPage').then((module) => ({
    default: module.ClientPortalPage,
  })),
);

const ClientDashboardPortalPage = lazy(() =>
  import('@/delivery/deliverables/ClientDashboardPortalPage').then(
    (module) => ({
      default: module.ClientDashboardPortalPage,
    }),
  ),
);

const createRootAppRouter = () =>
  createBrowserRouter(
    createRoutesFromElements(
      <Route element={<RootAppProviders />} loader={async () => null}>
        <Route element={<BlankLayout />}>
          <Route element={<OnboardingTransitionOutlet />}>
            <Route
              path={AppPath.SignInUp}
              element={
                <LazyRoute fallback={<OnboardingPageLoader />}>
                  <SignInUp />
                </LazyRoute>
              }
            />
            <Route
              path={AppPath.Invite}
              element={
                <LazyRoute fallback={<OnboardingPageLoader />}>
                  <SignInUp />
                </LazyRoute>
              }
            />
          </Route>
          <Route
            path={AppPath.PublicForm}
            element={
              <LazyRoute fallback={null}>
                <PublicLeadForm />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.Portal}
            element={
              <LazyRoute fallback={null}>
                <ClientPortalPage />
              </LazyRoute>
            }
          />
          <Route
            path="/client"
            element={
              <LazyRoute fallback={null}>
                <ClientDashboardPortalPage />
              </LazyRoute>
            }
          />
          <Route
            path="/client/:slug"
            element={
              <LazyRoute fallback={null}>
                <ClientDashboardPortalPage />
              </LazyRoute>
            }
          />
        </Route>
        <Route element={<AuthFlowLayout />}>
          <Route path={AppPath.VerifyEmail} element={<VerifyEmail />} />
          <Route
            path={AppPath.ResetPassword}
            element={
              <LazyRoute fallback={null}>
                <PasswordReset />
              </LazyRoute>
            }
          />
        </Route>
        <Route path={AppPath.Authorize} element={<RootAuthorizeRedirect />} />
        <Route
          path={AppPath.NotFoundWildcard}
          element={<Navigate to={AppPath.SignInUp} replace />}
        />
      </Route>,
    ),
  );

export const useCreateRootAppRouter = () => {
  const [router] = useState(createRootAppRouter);

  return router;
};
