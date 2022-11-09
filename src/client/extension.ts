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
			if (token.statement === 'comment') {
				console.dir(token, { depth: 10 })
				builder.push(token.location.start.offset, token.location.start.offset, token.location.end.offset-token.location.start.offset, tokenTypes.get('comment'), tokenModifiers.get('documentation')!);
			}
			// hfgl
		});
		return builder.build();
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
