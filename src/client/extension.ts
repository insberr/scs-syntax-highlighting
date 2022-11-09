/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { SCS } from 'schedule-script';
import { workspace, ExtensionContext, SemanticTokensLegend, TextDocument, CancellationToken, SemanticTokens, SemanticTokensBuilder, languages } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

const tokenTypes = new Map<string, number>();
const tokenModifiers = new Map<string, number>();

const legend = (function() {
	const tokenTypesLegend = [
		'comment', 'string', 'keyword', 'number', 'operator', 'namespace',
		'type', 'struct', 'class', 'interface', 'typeParameter', 'function',
		'method', 'decorator', 'variable', 'parameter', 'property', 'label'
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));

	const tokenModifiersLegend = [
		'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
		'modification',
	];
	tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index));

	return new SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
})();

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

class DocumentSemanticTokensProvider implements DocumentSemanticTokensProvider {
	async provideDocumentSemanticTokens(document: TextDocument, tok: CancellationToken): Promise<SemanticTokens> {
		let scsTokens = [];
		try {
			scsTokens = new SCS(document.getText()).parsed;
		} catch (err) {
			// ! take care of error here
		}

		// const allTokens = this._parseText(document.getText());
		const builder = new SemanticTokensBuilder();
		scsTokens.forEach((token) => {
			// hfgl
			builder.push(token.location.start.line, token.location.start.offset, token.location.end.offset - token.location.start.offset, this._encodeTokenType(token.statement), this._encodeTokenModifiers(token.args));
		});
		return builder.build();
	}

	private _encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!;
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.get('string')!;
		}
		return tokenTypes.get('string')!;
	}

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		return tokenModifiers.get('declaration')!
	}

	private _parseText(text: string): IParsedToken[] {
		const r: IParsedToken[] = [];
		const lines = text.split(/\r\n|\r|\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let currentOffset = 0;
			do {
				const openOffset = line.indexOf('[', currentOffset);
				if (openOffset === -1) {
					break;
				}
				const closeOffset = line.indexOf(']', openOffset);
				if (closeOffset === -1) {
					break;
				}
				const tokenData = this._parseTextToken(line.substring(openOffset + 1, closeOffset));
				r.push({
					line: i,
					startCharacter: openOffset + 1,
					length: closeOffset - openOffset - 1,
					tokenType: tokenData.tokenType,
					tokenModifiers: tokenData.tokenModifiers
				});
				currentOffset = closeOffset;
			} while (true);
		}
		return r;
	}

	private _parseTextToken(text: string): { tokenType: string; tokenModifiers: string[]; } {
		const parts = text.split('.');
		return {
			tokenType: parts[0],
			tokenModifiers: parts.slice(1)
		};
	}
}

// end pian




export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('out', 'server', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'scs' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.scsrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'scsLanguageServer',
		'Schedule Script Language Server',
		serverOptions,
		clientOptions
	);
	context.subscriptions.push(languages.registerDocumentSemanticTokensProvider({ language: 'scs' }, new DocumentSemanticTokensProvider(), legend));

	// Start the client. This will also launch the server
	client.start();
	console.log("Started Schedule Script Server");


}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
