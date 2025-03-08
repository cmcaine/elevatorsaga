// @ts-ignore
import * as prettier from 'https://unpkg.com/prettier@3.5.2/standalone.mjs';
// @ts-ignore
import * as prettierPluginBabel from 'https://unpkg.com/prettier@3.5.2/plugins/babel.mjs';
// @ts-ignore
import * as prettierPluginEstree from 'https://unpkg.com/prettier@3.5.2/plugins/estree.mjs';

import Emitter from './emitter.js';
import config from './config.js';
import { getCodeTemplate } from './util.js';
import { getModuleFromUserCode } from '../script/base.js';

async function format(code) {
	return await prettier.format(code, {
		parser: 'babel',
		plugins: [prettierPluginEstree, prettierPluginBabel],

		arrowParens: 'always',
		bracketSameLine: false,
		objectWrap: 'collapse',
		bracketSpacing: true,
		semi: true,
		experimentalOperatorPosition: 'end',
		experimentalTernaries: false,
		singleQuote: true,
		jsxSingleQuote: true,
		quoteProps: 'as-needed',
		trailingComma: 'all',
		singleAttributePerLine: false,
		htmlWhitespaceSensitivity: 'css',
		vueIndentScriptAndStyle: true,
		proseWrap: 'preserve',
		insertPragma: false,
		printWidth: 80,
		requirePragma: false,
		tabWidth: 4,
		useTabs: true,
		embeddedLanguageFormatting: 'auto',
	});
}

export class Editor extends Emitter {
	private readonly cm;

	constructor() {
		super();
		const cm = CodeMirror.fromTextArea(document.getElementById('code'), {
			lineNumbers: true,
			indentUnit: 4,
			indentWithTabs: false,
			theme: 'solarized light',
			mode: 'javascript',
			autoCloseBrackets: true,
			extraKeys: {
				// the following Tab key mapping is from http://codemirror.net/doc/manual.html#keymaps
				Tab: function (cm) {
					const spaces = new Array(cm.getOption('indentUnit') + 1).join(' ');
					cm.replaceSelection(spaces);
				},
			},
		});
		this.cm = cm;

		const reset = function () {
			cm.setValue(getCodeTemplate('default-elev-implementation'));
		};
		const saveCode = () => {
			localStorage.setItem(config.STORAGE_KEY_USERCODE, cm.getValue());
			document.querySelector('#save_message').textContent = `Code saved ${new Date().toLocaleTimeString()}`;
			this.trigger('change');
		};

		const existingCode = localStorage.getItem(config.STORAGE_KEY_USERCODE);
		if (existingCode) {
			cm.setValue(existingCode);
		} else {
			reset();
		}

		document.querySelector('#button_save').addEventListener('click', () => {
			saveCode();
			cm.focus();
		});

		document.querySelector('#button_reset').addEventListener('click', () => {
			if (confirm('Do you really want to reset to the default implementation?')) {
				localStorage.setItem(config.STORAGE_KEY_USERCODE_BACKUP, cm.getValue());
				reset();
			}
			cm.focus();
		});

		document.querySelector('#button_resetundo').addEventListener('click', () => {
			if (confirm('Do you want to bring back the code as before the last reset?')) {
				cm.setValue(localStorage.getItem(config.STORAGE_KEY_USERCODE_BACKUP) || '');
			}
			cm.focus();
		});

		document.querySelector('#button_format').addEventListener('click', async () => {
			cm.setValue((await format(cm.getValue())) || '');
			cm.focus();
		});

		const autoSaver = _.debounce(saveCode, 1000);
		cm.on('change', () => {
			autoSaver();
		});

		document.querySelector('#button_apply').addEventListener('click', () => {
			this.trigger('apply_code');
		});
	}

	async getCodeObj() {
		console.log('Getting code...');
		const code = this.cm.getValue();
		let obj;
		try {
			obj = await getModuleFromUserCode(code);
			this.trigger('code_success');
			return obj;
		} catch (e) {
			this.trigger('usercode_error', e);
			throw e;
		}
	}

	setCode(code) {
		this.cm.setValue(code);
	}
	getCode() {
		return this.cm.getValue();
	}
	setDevTestCode() {
		this.cm.setValue(getCodeTemplate('devtest-elev-implementation'));
	}
}
