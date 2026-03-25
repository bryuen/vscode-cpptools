/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { ResponseError } from 'vscode-languageclient';
import { Client, DefaultClient, GetDocumentSymbolRequest, GetDocumentSymbolRequestParams, GetDocumentSymbolResult, LocalizeDocumentSymbol, SymbolScope } from '../client';
import { clients } from '../extension';
import { getLocalizedString, getLocalizedSymbolScope } from '../localization';
import { RequestCancelled, ServerCancelled } from '../protocolFilter';
import { makeVscodeRange } from '../utils';

function getChildrenSymbols(symbols: LocalizeDocumentSymbol[]): vscode.DocumentSymbol[] {
    const documentSymbols: vscode.DocumentSymbol[] = [];
    if (symbols) {
        symbols.forEach((symbol) => {
            let detail: string = getLocalizedString(symbol.detail);
            if (symbol.scope === SymbolScope.Private) {
                if (detail.length === 0) {
                    detail = "private";
                } else {
                    detail = getLocalizedSymbolScope("private", detail);
                }
            } else if (symbol.scope === SymbolScope.Protected) {
                if (detail.length === 0) {
                    detail = "protected";
                } else {
                    detail = getLocalizedSymbolScope("protected", detail);
                }
            }

            // Move the scope in the name to the detail.
            if (detail.length === 0) {
                let offset_paren: number = symbol.name.indexOf("(");
                if (offset_paren < 0) {
                    offset_paren = symbol.name.length;
                }
                const offset_scope: number = symbol.name.lastIndexOf("::", offset_paren - 2);
                if (offset_scope > 0) {
                    detail = symbol.name.substring(0, offset_scope);
                    symbol.name = symbol.name.substring(offset_scope + 2);
                }
            }

            let r: vscode.Range = makeVscodeRange(symbol.range);
            const sr: vscode.Range = makeVscodeRange(symbol.selectionRange);
            if (!r.contains(sr)) {
                r = sr;
            }
            const vscodeSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(symbol.name, detail, symbol.kind, r, sr);
            vscodeSymbol.children = getChildrenSymbols(symbol.children);
            documentSymbols.push(vscodeSymbol);
        });
    }
    return documentSymbols;
}

export async function sendDocumentSymbolRequest(client: DefaultClient, uri: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[] | undefined> {
    await client.ready;

    const params: GetDocumentSymbolRequestParams = {
        uri: uri.toString()
    };

    let response: GetDocumentSymbolResult;
    try {
        response = await client.languageClient.sendRequest(GetDocumentSymbolRequest, params, token);
    } catch (e: any) {
        if (e instanceof ResponseError && (e.code === RequestCancelled || e.code === ServerCancelled)) {
            return undefined;
        }
        throw e;
    }

    if (token.isCancellationRequested) {
        return undefined;
    }

    return getChildrenSymbols(response.symbols);
}

export class DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const client: Client = clients.getClientFor(document.uri);
        if (client instanceof DefaultClient) {
            const resultSymbols: vscode.DocumentSymbol[] | undefined = await sendDocumentSymbolRequest(client, document.uri, token);
            if (resultSymbols === undefined) {
                throw new vscode.CancellationError();
            }
            return resultSymbols;
        }
        return [];
    }
}
