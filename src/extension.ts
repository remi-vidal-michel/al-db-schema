import * as vscode from 'vscode';
import { scanAlProject } from './alScanner';
import { generateMermaidERD, generateMermaidHtml } from './mermaidGenerator';

export function activate(context: vscode.ExtensionContext) {

	const disposable = vscode.commands.registerCommand('al-db-schema.generateSchema', async () => {
		// 1. Determine workspace folder
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('Aucun dossier de workspace ouvert.');
			return;
		}

		let workspaceFolder: vscode.WorkspaceFolder;
		if (workspaceFolders.length === 1) {
			workspaceFolder = workspaceFolders[0];
		} else {
			const picked = await vscode.window.showWorkspaceFolderPick({
				placeHolder: 'Sélectionnez le projet AL à analyser',
			});
			if (!picked) {
				return;
			}
			workspaceFolder = picked;
		}

		// 2. Scan the project
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'AL DB Schema',
				cancellable: false,
			},
			async (progress) => {
				progress.report({ message: 'Détection du projet AL...' });

				const scanResult = await scanAlProject(workspaceFolder.uri);

				// Check for errors
				if (scanResult.errors.length > 0 && scanResult.tables.length === 0) {
					vscode.window.showErrorMessage(scanResult.errors.join('\n'));
					return;
				}

				if (scanResult.tables.length === 0) {
					vscode.window.showWarningMessage('Aucune table AL trouvée dans ce projet.');
					return;
				}

				progress.report({ message: `${scanResult.tables.length} table(s) trouvée(s). Génération du diagramme...` });

				// 3. Generate Mermaid ERD
				const mermaidCode = generateMermaidERD(scanResult);

				// 4. Get project name from app.json
				const appName = scanResult.appJson
					? String((scanResult.appJson as Record<string, unknown>)['name'] || 'AL Project')
					: 'AL Project';

				const tableCount = scanResult.tables.filter(t => t.objectType === 'table').length;
				const extCount = scanResult.tables.filter(t => t.objectType === 'tableextension').length;
				const relCount = scanResult.relations.length;
				const title = `Schéma DB — ${appName}`;
				const subtitle = `${tableCount} table(s), ${extCount} extension(s), ${relCount} relation(s)`;

				// 5. Show in a WebView panel
				const panel = vscode.window.createWebviewPanel(
					'alDbSchema',
					title,
					vscode.ViewColumn.One,
					{
						enableScripts: true,
						retainContextWhenHidden: true,
					}
				);

				const html = generateMermaidHtml(mermaidCode, `${title} — ${subtitle}`);
				panel.webview.html = html;

				// Handle messages from the webview (copy button)
				panel.webview.onDidReceiveMessage(async (message) => {
					if (message.command === 'copy') {
						await vscode.env.clipboard.writeText(message.text);
						vscode.window.showInformationMessage('Code Mermaid copié dans le presse-papiers !');
					}
				});

				// Show warnings if any
				if (scanResult.errors.length > 0) {
					const channel = vscode.window.createOutputChannel('AL DB Schema');
					channel.appendLine('⚠ Avertissements lors de l\'analyse :');
					for (const err of scanResult.errors) {
						channel.appendLine(`  • ${err}`);
					}
					channel.show(true);
				}

				// Also offer to save the .mmd file
				const saveAction = await vscode.window.showInformationMessage(
					`Diagramme généré : ${tableCount} table(s), ${relCount} relation(s).`,
					'Sauvegarder en .mmd'
				);

				if (saveAction === 'Sauvegarder en .mmd') {
					const uri = await vscode.window.showSaveDialog({
						defaultUri: vscode.Uri.joinPath(workspaceFolder.uri, 'schema.mmd'),
						filters: { 'Mermaid': ['mmd'] },
					});
					if (uri) {
						await vscode.workspace.fs.writeFile(uri, Buffer.from(mermaidCode, 'utf-8'));
						vscode.window.showInformationMessage(`Fichier sauvegardé : ${uri.fsPath}`);
					}
				}
			}
		);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
