import * as vscode from 'vscode';
import * as path from 'path';
import { parseAlFile } from './alParser';
import { AlProjectScanResult, AlTable } from './types';

/**
 * Detect whether the given workspace folder is an AL project.
 * Criteria: presence of app.json and at least one .al file.
 */
export async function detectAlProject(workspaceFolder: vscode.Uri): Promise<{ isAlProject: boolean; appJson: Record<string, unknown> | null }> {
    try {
        const appJsonUri = vscode.Uri.joinPath(workspaceFolder, 'app.json');
        const appJsonContent = await vscode.workspace.fs.readFile(appJsonUri);
        const appJson = JSON.parse(Buffer.from(appJsonContent).toString('utf-8'));

        // Check for at least one .al file
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

/**
 * Scan the entire workspace folder for .al files containing table / tableextension
 * objects and return the full scan result.
 */
export async function scanAlProject(workspaceFolder: vscode.Uri): Promise<AlProjectScanResult> {
    const result: AlProjectScanResult = {
        tables: [],
        relations: [],
        appJson: null,
        errors: [],
    };

    // 1. Detect project
    const detection = await detectAlProject(workspaceFolder);
    if (!detection.isAlProject) {
        result.errors.push('Ce dossier ne semble pas être un projet AL (app.json absent ou aucun fichier .al trouvé).');
        return result;
    }
    result.appJson = detection.appJson;

    // 2. Find all .al files
    const alFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, '**/*.al'),
        '**/node_modules/**'
    );

    // 3. Parse each file
    for (const fileUri of alFiles) {
        try {
            const raw = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(raw).toString('utf-8');
            const parsed = parseAlFile(content, fileUri.fsPath);
            result.tables.push(...parsed);
        } catch (err: unknown) {
            const relPath = path.relative(workspaceFolder.fsPath, fileUri.fsPath);
            result.errors.push(`Erreur lors de l'analyse de ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 4. Merge tableextension fields into base tables
    mergeTableExtensions(result.tables);

    // 5. Build relations
    for (const table of result.tables) {
        for (const field of table.fields) {
            if (field.isForeignKey && field.relatedTable) {
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

/**
 * For tableextension objects, try to merge their fields into the
 * corresponding base table if it was found in this project.
 * The tableextension itself is kept in the list for reference.
 */
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
                // Add extension fields to base table
                for (const f of ext.fields) {
                    if (!base.fields.some(bf => bf.name.toLowerCase() === f.name.toLowerCase())) {
                        base.fields.push({ ...f });
                    }
                }
            }
        }
    }
}
