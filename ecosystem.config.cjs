module.exports = {
	apps: [
		{
			name: 'hoshimi-station',
			cwd: __dirname,
			script: 'app/build/index.js',
			watch: false,
			exec_mode: 'cluster',
			instances: 1,
			autorestart: true,
			cron_restart: '7 * * * *',
			env: {
				NODE_ENV: 'production',
				HOST: '127.0.0.1',
				PORT: 3042
			}
		}
	]
};
