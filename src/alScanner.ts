import * as vscode from 'vscode';
import * as path from 'path';
import { parseAlFile } from './alParser';
import { AlProjectScanResult, AlTable } from './types';

export async function detectAlProject(workspaceFolder: vscode.Uri): Promise<{ isAlProject: boolean; appJson: Record<string, unknown> | null }> {
    try {
        const appJsonUri = vscode.Uri.joinPath(workspaceFolder, 'app.json');
        const appJsonContent = await vscode.workspace.fs.readFile(appJsonUri);
        const appJson = JSON.parse(Buffer.from(appJsonContent).toString('utf-8'));

        const alFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/*.al'),
            '**/node_modules/**',
            1
        );

        return { isAlProject: alFiles.length > 0, appJson };
    } catch {
        return { isAlProject: false, appJson: null };
    }
}

export async function scanAlProject(workspaceFolder: vscode.Uri): Promise<AlProjectScanResult> {
    const result: AlProjectScanResult = {
        tables: [],
        relations: [],
        appJson: null,
        errors: [],
    };

    const detection = await detectAlProject(workspaceFolder);
    if (!detection.isAlProject) {
        result.errors.push('This folder does not appear to be an AL project (app.json missing or no .al files found).');
        return result;
    }
    result.appJson = detection.appJson;

    const alFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, '**/*.al'),
        '**/node_modules/**'
    );

    for (const fileUri of alFiles) {
        try {
            const raw = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(raw).toString('utf-8');
            const parsed = parseAlFile(content, fileUri.fsPath);
            result.tables.push(...parsed);
        } catch (err: unknown) {
            const relPath = path.relative(workspaceFolder.fsPath, fileUri.fsPath);
            result.errors.push(`Error parsing ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    mergeTableExtensions(result.tables);

    result.tables = result.tables.filter(t => !isCueTable(t.name));

    for (const table of result.tables) {
        for (const field of table.fields) {
            if (field.isForeignKey && field.relatedTable) {
                if (isCueTable(field.relatedTable)) {
                    continue;
                }
                result.relations.push({
                    fromTable: table.objectType === 'tableextension' ? table.extendsTable || table.name : table.name,
                    fromField: field.name,
                    toTable: field.relatedTable,
                    toField: field.relatedField || '',
                });
            }
        }
    }

    return result;
}

function isCueTable(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.endsWith('cue') || lower.endsWith('cues') || lower.includes(' cue ');
}

function mergeTableExtensions(tables: AlTable[]): void {
    const tablesByName = new Map<string, AlTable>();
    for (const t of tables) {
        if (t.objectType === 'table') {
            tablesByName.set(t.name.toLowerCase(), t);
        }
    }

    for (const ext of tables) {
        if (ext.objectType === 'tableextension' && ext.extendsTable) {
            const base = tablesByName.get(ext.extendsTable.toLowerCase());
            if (base) {
                for (const f of ext.fields) {
                    if (!base.fields.some(bf => bf.name.toLowerCase() === f.name.toLowerCase())) {
                        base.fields.push({ ...f });
                    }
                }
            }
        }
    }
}
