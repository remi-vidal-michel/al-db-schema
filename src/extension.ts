import * as vscode from "vscode";
import { scanAlProject } from "./alScanner";
import { generateDiagramHtml } from "./diagramRenderer";

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand("al-db-schema.generateSchema", async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No workspace folder open.");
            return;
        }

        let workspaceFolder: vscode.WorkspaceFolder;
        if (workspaceFolders.length === 1) {
            workspaceFolder = workspaceFolders[0];
        } else {
            const picked = await vscode.window.showWorkspaceFolderPick({
                placeHolder: "Select the AL project to analyze",
            });
            if (!picked) {
                return;
            }
            workspaceFolder = picked;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "AL DB Schema",
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: "Scanning AL project..." });

                const scanResult = await scanAlProject(workspaceFolder.uri);

                if (scanResult.errors.length > 0 && scanResult.tables.length === 0) {
                    vscode.window.showErrorMessage(scanResult.errors.join("\n"));
                    return;
                }

                if (scanResult.tables.length === 0) {
                    vscode.window.showWarningMessage("No AL tables found in this project.");
                    return;
                }

                progress.report({ message: `${scanResult.tables.length} table(s) found. Generating diagram...` });

                const appName = scanResult.appJson
                    ? String((scanResult.appJson as Record<string, unknown>)["name"] || "AL Project")
                    : "AL Project";

                const tableCount = scanResult.tables.filter((t) => t.objectType === "table").length;
                const extCount = scanResult.tables.filter((t) => t.objectType === "tableextension").length;
                const relCount = scanResult.relations.length;
                const title = `DB Schema — ${appName}`;
                const subtitle = `${tableCount} table(s), ${extCount} extension(s), ${relCount} relation(s)`;

                const panel = vscode.window.createWebviewPanel("alDbSchema", title, vscode.ViewColumn.One, {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(context.extensionUri, "src"),
                        vscode.Uri.joinPath(context.extensionUri, "node_modules", "elkjs", "lib"),
                    ],
                });

                panel.webview.html = generateDiagramHtml(
                    panel.webview,
                    context.extensionUri,
                    scanResult,
                    title,
                    subtitle,
                );

                if (scanResult.errors.length > 0) {
                    const channel = vscode.window.createOutputChannel("AL DB Schema");
                    channel.appendLine("Warnings during analysis:");
                    for (const err of scanResult.errors) {
                        channel.appendLine(`  - ${err}`);
                    }
                    channel.show(true);
                }
            },
        );

        vscode.window.showInformationMessage("Schema generation complete.");
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
