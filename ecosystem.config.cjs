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
			env: {
				NODE_ENV: 'production',
				PROJECT_ROOT: __dirname,
				DB_PATH: `${__dirname}/data/hoshimi.sqlite3`,
				GUIDELINES_PATH: `${__dirname}/docs/translation-guidelines.md`,
				AI_GUIDELINES_PATH: `${__dirname}/docs/ai-guidelines.txt`,
				ADMIN_NICKNAMES: '사일',
				OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
				OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
				OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
				OPENAI_REASONING_EFFORT: process.env.OPENAI_REASONING_EFFORT || 'low',
				HOST: '0.0.0.0',
				PORT: 3042
			}
		}
	]
};
