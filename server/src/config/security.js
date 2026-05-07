import helmet from 'helmet';

export const securityMiddleware = helmet({
  crossOriginResourcePolicy: {
    policy: 'same-site',
  },
});
