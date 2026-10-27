import { defineFeature, setUserResolver } from '../../platform/rpc';
import * as auth from './service';

/** Auth & sessions. Every RPC request is identified by its session cookie (see resolveSession). */
setUserResolver(auth.resolveSession);

defineFeature('auth', {
  signIn: { public: true, handler: auth.passwordSignIn },
  signOut: { public: true, handler: auth.signOut },
  currentUser: { public: true, handler: auth.currentUser },
  demoAccounts: { public: true, handler: auth.demoAccounts },
  requestPasswordReset: { public: true, handler: auth.requestPasswordReset },
  setPassword: { public: true, handler: auth.setPassword },
  switchPersona: auth.switchPersona,
  inviteUser: auth.inviteUser,
});

export { SESSION_COOKIE, hashPassword } from './service';
