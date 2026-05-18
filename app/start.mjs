process.env.HOST ||= '127.0.0.1';
process.env.PORT ||= '3042';

await import('./build/index.js');
