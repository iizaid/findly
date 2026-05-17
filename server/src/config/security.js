import helmet from 'helmet';

export const securityMiddleware = helmet({
  crossOriginResourcePolicy: {
    policy: 'same-site',
  },
  referrerPolicy: {
    policy: 'no-referrer',
  },
  frameguard: {
    action: 'deny',
  },
});
