import * as vscode from "vscode";
import { scanAlProject } from "./alScanner";
import { generateDiagramHtml } from "./diagramRenderer";

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("al-db-schema.generateSchema", async () => {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length) {
                vscode.window.showErrorMessage("No workspace folder open.");
                return;
            }

            const folder = folders.length === 1
                ? folders[0]
                : await vscode.window.showWorkspaceFolderPick({ placeHolder: "Select the AL project to analyze" });
            if (!folder) return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: "AL DB Schema", cancellable: false },
                async (progress) => {
                    progress.report({ message: "Scanning AL project..." });
                    const scan = await scanAlProject(folder.uri);

                    if (scan.errors.length > 0 && scan.tables.length === 0) {
                        vscode.window.showErrorMessage(scan.errors.join("\n"));
                        return;
                    }
                    if (scan.tables.length === 0) {
                        vscode.window.showWarningMessage("No AL tables found in this project.");
                        return;
                    }

                    progress.report({ message: `${scan.tables.length} table(s) found. Generating diagram...` });

                    const appName = scan.appJson
                        ? String((scan.appJson as Record<string, unknown>)["name"] || "AL Project")
                        : "AL Project";
                    const tableCount = scan.tables.filter((t) => t.objectType === "table").length;
                    const extCount = scan.tables.filter((t) => t.objectType === "tableextension").length;
                    const title = `DB Schema — ${appName}`;
                    const subtitle = `${tableCount} table(s), ${extCount} extension(s), ${scan.relations.length} relation(s)`;

                    const panel = vscode.window.createWebviewPanel("alDbSchema", title, vscode.ViewColumn.One, {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "src")],
                    });

                    panel.webview.html = generateDiagramHtml(panel.webview, context.extensionUri, scan, title, subtitle);

                    if (scan.errors.length > 0) {
                        const channel = vscode.window.createOutputChannel("AL DB Schema");
                        channel.appendLine("Warnings during analysis:");
                        for (const err of scan.errors) channel.appendLine(`  - ${err}`);
                        channel.show(true);
                    }
                },
            );

            vscode.window.showInformationMessage("Schema generation complete.");
        }),
    );
}

export function deactivate() {}
