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
				PROJECT_ROOT: __dirname,
				DB_PATH: `${__dirname}/data/hoshimi.sqlite3`,
				GUIDELINES_PATH: `${__dirname}/docs/translation-guidelines.md`,
				HOST: '127.0.0.1',
				PORT: 3042
			}
		}
	]
};
