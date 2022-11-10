/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    TextEdit,
    Hover,
    SemanticTokens
} from "vscode-languageserver/node";
import { Block, LintLevel, SCS, Statement, _statements } from "schedule-script";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Hovers } from "./hovers";
import { diffChars } from "diff";
import { recurseInto } from '../lib';
import { legend, provideDocumentSemanticTokens } from './tokens';
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;
    if (!capabilities.textDocument.semanticTokens.multilineTokenSupport) {
      console.warn("The client does not support multiline tokens.");
    }
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
            },
            semanticTokensProvider: {
              legend: legend,
              full: true,
            },
            
            documentFormattingProvider: true,
			hoverProvider: true,
			/*
			semanticTokensProvider: {
				documentSelector: [{ scheme: 'file', language: 'scs' }],
				legend: {
					tokenTypes: [
						"comment",
						"keyword",
						"string",
						"number",
						"regexp",
						"operator",
						"namespace",
						"type",
						"struct",
						"class",
						"interface",
						"enum",
						"typeParameter",
						"function",
						"member",
						"macro",
						"variable",
						"parameter",
						"property",
					],
					tokenModifiers: [
						"declaration",
						"documentation",
						"static",
						"abstract",
						"deprecated",
						"readonly",
					],
				},
				full: {
					delta: false,
				},
			},
			*/
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }
    connection.console.log("ok buddddy");
    return result;
});

connection.languages.semanticTokens.on((params) => {
    return provideDocumentSemanticTokens(documents.get(params.textDocument.uri))
})

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log("Workspace folder change event received.");
        });
    }
});

// The example settings
interface Settings {}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = { maxNumberOfProblems: 1000 };
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <Settings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<Settings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: "languageServerExample",
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    // In this simple example we get the settings for every validate run.
    const settings = await getDocumentSettings(textDocument.uri);

    // The validator creates diagnostics for all uppercase words length 2 and more
    const text = textDocument.getText();
    let diagnostics: Diagnostic[] = [];
    let n: SCS;
    try {
        n = new SCS(text);
    } catch (e) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(e.location.start.offset),
                end: textDocument.positionAt(e.location.end.offset),
            },
            message: e.toString(),
        });
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        return;
    }
    const mapping = new Map<LintLevel, DiagnosticSeverity>();
    mapping.set(LintLevel.info, DiagnosticSeverity.Information);
    mapping.set(LintLevel.warn, DiagnosticSeverity.Warning);
    mapping.set(LintLevel.error, DiagnosticSeverity.Error);
    n.lint().forEach((e) => {
        diagnostics.push({
            severity: mapping.get(e.level) || DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(e.location.start.offset),
                end: textDocument.positionAt(e.location.start.offset),
            },
            message: e.message,
        });
    })
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {
    // Monitored files have change in VSCode
    connection.console.log("We received an file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.
        return _statements.map((e) => {
            return {
                label: e,
                data: e,
                type: CompletionItemKind.Text,
            }
        })
    });

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    item.detail = Hovers.get(item.data);
    return item;
});


connection.onHover(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    const offset = doc.offsetAt(position);
    let n: SCS;
    try {
        n = new SCS(doc.getText());
    } catch (e) {
        return;
    }
    let found: Statement | undefined;
    recurseInto(n.parsed, (e) => {
        if (
            e.location.start.offset <= offset &&
            e.location.end.offset >= offset
        ) {
            found = e;
        }
    });
    const data = Hovers.get(found?.statement);
    if (data) {
        return {
            contents: data,
            range: {
                start: doc.positionAt(found.location.start.offset),
                end: doc.positionAt(found.location.end.offset),
            },
        };
    }
});

connection.onDocumentFormatting(({ textDocument, options }) => {
    const doc = documents.get(textDocument.uri);
    const n = new SCS(doc.getText());
    const text = n.pretty();
    const diff = diffChars(doc.getText(), text);
    connection.console.log(JSON.stringify(diff, null, 2));
    let start = 0;
    return []; // not implemented
    return diff
        .map((e) => {
            if (e.removed) {
                const r = TextEdit.del({
                    start: doc.positionAt(start),
                    end: doc.positionAt(start + e.count),
                });
                start -= e.count;
                return r;
            } else if (e.added) {
                const r = TextEdit.insert(doc.positionAt(start), e.value);
                start += e.count;
                return r;
            }
            start += e.count;
        })
        .filter((n) => n);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
