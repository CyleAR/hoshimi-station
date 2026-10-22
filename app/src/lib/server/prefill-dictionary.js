import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	const cwd = process.cwd();
	return existsSync(path.resolve(cwd, 'docs', 'prefill_dictionary.json')) ? cwd : path.resolve(cwd, '..');
}

export function runDictionaryCommand(payload, dbPath) {
	const root = projectRoot();
	const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
	return new Promise((resolve, reject) => {
		const child = execFile(python, ['-X', 'utf8', path.join(root, 'scripts', 'prefill_dictionary.py'),
			'--db', dbPath, '--dictionary', path.resolve(process.env.PREFILL_DICTIONARY_PATH || path.join(root, 'docs', 'prefill_dictionary.json')),
			'--backups', path.join(root, 'backups', 'prefill-dictionary')],
		{ cwd: root, timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
			if (stderr) console.error('[prefill-dictionary]', stderr.trim());
			if (error) return reject(new Error('사전 처리 실행에 실패했습니다. Python 실행 경로와 서버 로그를 확인해 주세요.'));
			try { resolve(JSON.parse(stdout)); }
			catch { reject(new Error('사전 처리 결과를 읽을 수 없습니다. 서버 로그를 확인해 주세요.')); }
		});
		child.stdin.on('error', () => {});
		child.stdin.end(JSON.stringify(payload));
	});
}
