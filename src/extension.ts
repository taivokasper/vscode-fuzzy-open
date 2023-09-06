import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Fuse from 'fuse.js';

const options = {
	includeScore: true,
	useExtendedSearch: true,
	matchAllTokens: true,
	threshold: 0.8,
	keys: ['relFilePath', 'workspaceName']
};

const maxResults = 25;

const excludeFolders = [
	".git",
	".hg",
	".ipynb_checkpoints",
	".pytest_cache",
	".repo",
	".vscode",
	"build",
	"dist",
	"node_modules",
	"out",
	".yalc",
	".DS_Store",
];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const fuse = new Fuse([] as FileOption[], options);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-fuzzy-open" is now active!');

	const disposable = vscode.commands.registerCommand('vscode-fuzzy-open.FuzzyOpen', async () => {
		const files = (vscode.workspace.workspaceFolders || [])
			.map((folder) => ({
				workspaceName: folder.name,
				workspacePath: folder.uri.path,
			}))
			.filter((folder) => fs.existsSync(folder.workspacePath))
			.flatMap((folder) => {
				const files = Array.from(readAllFiles(folder.workspacePath, excludeFolders));
				return files.map((file) => ({
					workspaceName: folder.workspaceName,
					workspacePath: folder.workspacePath,
					filePath: file,
					relFilePath: path.relative(folder.workspacePath, file),
				}));
			});

		fuse.setCollection(files);

		const quickPick = vscode.window.createQuickPick();
		quickPick.matchOnDetail = false;
		quickPick.matchOnDescription = false;
		(quickPick as any).sortByLabel = false;

		quickPick.items = files.map((file) => createQuickItem(file)).slice(0, maxResults);

		quickPick.onDidChangeValue((term) => {
			quickPick.items = fuse
				.search(term, { limit: maxResults })
				.map((item) => item.item)
				.map((file) => createQuickItem(file));

			if (quickPick.items.length > 0) {
				quickPick.items[0].picked = true;
			}
		});

		quickPick.onDidAccept(() => {
			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length > 1) {
				throw Error('more than one element selected');
			} else if (selectedItems.length === 0) {
				return;
			}

			const selectedItem = selectedItems[0] as UsefulQuickPickItem;

			vscode.workspace
				.openTextDocument(vscode.Uri.file(selectedItem.filePath))
				.then((doc) => {
					vscode.window.showTextDocument(doc);
				});

			quickPick.hide();
		});

		quickPick.show();
	});

	context.subscriptions.push(disposable);
}

interface FileOption {
	workspaceName: string;
	workspacePath: string;
	filePath: string;
	relFilePath: string;
}

interface UsefulQuickPickItem extends vscode.QuickPickItem, FileOption {}

function createQuickItem(file: FileOption): UsefulQuickPickItem {
	return {
		...file,
		label: path.parse(file.filePath).base,
		description: file.workspaceName,
		detail: file.relFilePath,
		alwaysShow: true,
	};
}

function* readAllFiles(dir: string, exclude: string[]): Generator<string> {
	const files = fs.readdirSync(dir, { withFileTypes: true }).filter((file) => !exclude.includes(path.parse(file.name).base));

	for (const file of files) {
		if (file.isDirectory() && !exclude.includes(path.parse(file.name).base)) {
			yield* readAllFiles(path.join(dir, file.name), exclude);
		} else {
			yield path.join(dir, file.name);
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
