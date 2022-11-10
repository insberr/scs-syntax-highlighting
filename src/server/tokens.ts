import { Block, SCS } from 'schedule-script';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CancellationToken, SemanticTokens, SemanticTokensBuilder, SemanticTokensLegend } from 'vscode-languageserver/node';
import { recurseInto } from '../lib';

const tokenTypes = new Map<string, number>();
const tokenModifiers = new Map<string, number>();

export const legend: SemanticTokensLegend = (function() {
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

	return { tokenTypes: tokenTypesLegend, tokenModifiers: tokenModifiersLegend };
})();



export function provideDocumentSemanticTokens(document: TextDocument): SemanticTokens {
	let scsTokens: Block = [];
	try {
		scsTokens = new SCS(document.getText()).parsed;
	} catch (err) {
		// ! take care of error here
		return;
	}

	// const allTokens = this._parseText(document.getText());
	const builder = new SemanticTokensBuilder();
	/*
	scsTokens.forEach((token) => {
		// use regexes for basics
		// and then this to do all the finer details
		// for things that would be a pain to take care of in regex form
		// comments are just a test kinda thing
		if (token.statement === 'comment') {
			// console.dir(token, { depth: 10 })
			const pos = document.positionAt(token.location.start.offset)
			// console.dir(pos, { depth: 30 });
			builder.push(pos.line, pos.character, token.location.end.offset-token.location.start.offset, tokenTypes.get('comment'), tokenModifiers.get('documentation')!);
		} else if (token.statement === 'multicomment') {
			// doesnt work because pain
			const startPos = document.positionAt(token.location.start.offset);
			const endPos = document.positionAt(token.location.end.offset);
			const contents = ['/*', ...token.comment.split('\n'), '\'];
			// iterate over every line
			const lines = (endPos.line - startPos.line)+2;
			for (let i = 0; lines < i; i++) {
				builder.push(startPos.line + i, startPos.character, contents[i].length+1, tokenTypes.get('comment')!, tokenModifiers.get('documentation')!)
			}
		}
		// hfgl
	});*/
	recurseInto(scsTokens, (s,p) => {
		if (s.statement === 'comment') {
			const pos = document.positionAt(s.location.start.offset);
			builder.push(pos.line, pos.character, s.location.end.offset-s.location.start.offset, tokenTypes.get('comment'), tokenModifiers.get('documentation')!);
			return;
		}
		if (s.statement == "multicomment") {
			// doesnt work because pain
			const startPos = document.positionAt(s.location.start.offset);
			const endPos = document.positionAt(s.location.end.offset);
			const contents = ['/*', ...(s.comment as string).split('\n'), '*/'];
			// iterate over every line
			const lines = (endPos.line - startPos.line)+2;
			for (let i = 0; lines < i; i++) {
				builder.push(startPos.line + i, startPos.character, contents[i].length+1, tokenTypes.get('comment')!, tokenModifiers.get('documentation')!)
			}
			return
		}
		// somehow find the arguments, maybe add a location parameter to each argument? maybe?
		const pos = document.positionAt(s.location.start.offset);
		builder.push(pos.line, pos.character, s.statement.length, tokenTypes.get('keyword')!, tokenModifiers.get("declaration")!);
		if (s.comment) {
			builder.push(pos.line, pos.character+((s.location.end.offset-s.location.start.offset)-(s.comment as string).length), (s.comment as string).length, tokenTypes.get('comment')!, tokenModifiers.get('documentation')!);
		}
		//builder.push(pos.line, pos.character + s.statement.length + 1, s.location.end.offset-(s.location.end.offset+s.statement.length), tokenTypes.get('parameter')!, tokenModifiers.get("declaration")!);
	})
	return builder.build();
}