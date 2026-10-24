// Production = any Vercel deployment, or NODE_ENV=production anywhere (e.g. `npm start` on a server).
export const isProduction = (env = process.env) => env.VERCEL === '1' || env.NODE_ENV === 'production';
