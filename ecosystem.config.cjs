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
				HYPER_API_KEY: process.env.HYPER_API_KEY || 'sk-hyper-76642269-01d5-47e1-898b-3e216285d3ed',
				HYPER_BASE_URL: process.env.HYPER_BASE_URL || 'https://hyper.charm.land/v1',
				HYPER_MODEL: process.env.HYPER_MODEL || 'deepseek-v4-flash-0731',
				HYPER_REASONING_EFFORT: process.env.HYPER_REASONING_EFFORT || '',
				OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
				OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '',
				OPENAI_MODEL: process.env.OPENAI_MODEL || '',
				OPENAI_REASONING_EFFORT: process.env.OPENAI_REASONING_EFFORT || '',
				HOST: '0.0.0.0',
				PORT: 3042
			}
		}
	]
};
