import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { globalIgnores } from "eslint/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const projectServiceCfg = {
	allowDefaultProject: [
		'eslint.config.js',
		'manifest.json'
	]
};

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				tsconfigRootDir: __dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.{ts,cts,mts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: projectServiceCfg,
			},
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"test/**",
		"coverage/**",
		"jest.config.ts",
		"package.json"
	]),
);
