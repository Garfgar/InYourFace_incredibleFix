// A lot of the code used to make this extension is from the following repos:
// https://github.com/phindle/error-lens/blob/master/src/extension.ts
// https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample
// https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample
// https://code.visualstudio.com/api/extension-guides/webview
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
// The module 'vscode' contains the VS Code extensibility API
const vscode = require('vscode');

function activate(context) {
    console.log("Extension activated");
    const provider = new CustomSidebarViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(CustomSidebarViewProvider.viewType, provider));
    let errorLensEnabled = true;

    let disposableEnableErrorLens = vscode.commands.registerCommand("ErrorLens.enable", () => {
        errorLensEnabled = true;
        const activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor) {
            updateDecorationsForUri(activeTextEditor.document.uri);
        }
    });
    context.subscriptions.push(disposableEnableErrorLens);

    let disposableDisableErrorLens = vscode.commands.registerCommand("ErrorLens.disable", () => {
        errorLensEnabled = false;
        const activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor) {
            updateDecorationsForUri(activeTextEditor.document.uri);
        }
    });
    context.subscriptions.push(disposableDisableErrorLens);

    vscode.languages.onDidChangeDiagnostics((diagnosticChangeEvent) => {
        onChangedDiagnostics(diagnosticChangeEvent);
    }, null, context.subscriptions);

    vscode.workspace.onDidOpenTextDocument((textDocument) => {
        updateDecorationsForUri(textDocument.uri);
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor((textEditor) => {
        if (textEditor === undefined) {
            return;
        }
        updateDecorationsForUri(textEditor.document.uri);
    }, null, context.subscriptions);

    function onChangedDiagnostics(diagnosticChangeEvent) {
        if (!vscode.window) {
            return;
        }
        const activeTextEditor = vscode.window.activeTextEditor;
        if (!activeTextEditor) {
            return;
        }
        for (const uri of diagnosticChangeEvent.uris) {
            if (uri.fsPath === activeTextEditor.document.uri.fsPath) {
                updateDecorationsForUri(uri);
                break;
            }
        }
    }

    function updateDecorationsForUri(uriToDecorate) {
        if (!uriToDecorate || uriToDecorate.scheme !== "file" || !vscode.window) {
            return;
        }
        const activeTextEditor = vscode.window.activeTextEditor;
        if (!activeTextEditor || !activeTextEditor.document.uri.fsPath) {
            return;
        }
        
        // This part was just for counting errors for ErrorLens logic
        if (errorLensEnabled) {
            // (Original decoration logic would go here)
        }
    }
}
exports.activate = activate;

class CustomSidebarViewProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this._currentFace = 1; 
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        // Generate the static HTML only ONCE
        const face1Uri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "1.png"));
        const cssUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.css"));
        
        webviewView.webview.html = this.getStaticHtml(webviewView, cssUri, face1Uri);

        // Set up the interval to check for errors and send messages to the frontend
        setInterval(() => {
            const { weightedProblems, errorCount, warningCount } = getWeightedProblemCount();
            let newFace = 1;

            // Tier logic for 10 faces (each tier is 4 weighted problems wide)
            if (weightedProblems < 4) newFace = 1; // Face 1: 0, 1, 2, 3
            else if (weightedProblems < 8) newFace = 2; // Face 2: 4, 5, 6, 7
            else if (weightedProblems < 12) newFace = 3; // Face 3: 8, 9, 10, 11
            else if (weightedProblems < 16) newFace = 4; // Face 4: 12, 13, 14, 15
            else if (weightedProblems < 20) newFace = 5; // Face 5: 16, 17, 18, 19
            else if (weightedProblems < 24) newFace = 6; // Face 6: 20, 21, 22, 23
            else if (weightedProblems < 28) newFace = 7; // Face 7: 24, 25, 26, 27
            else if (weightedProblems < 32) newFace = 8; // Face 8: 28, 29, 30, 31
            else if (weightedProblems < 36) newFace = 9; // Face 9: 32, 33, 34, 35
            else newFace = 10; // Face 10: 36+

            // Only send a message if the face changed (prevents audio looping every 1s)
            if (newFace !== this._currentFace) {
                this._currentFace = newFace;

                // Generate the secure URIs for the new assets
                const newImageUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", `${newFace}.png`)).toString();
                const newAudioUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", `${newFace}.mp3`)).toString();

                // Send the data to the frontend
                webviewView.webview.postMessage({
                    command: 'updateFace',
                    image: newImageUri,
                    audio: newAudioUri,
                    errorCount: errorCount, 
                    warningCount: warningCount, 
                    weightedProblems: weightedProblems 
                });
            } else {
                 // Send update for text even if face hasn't changed
                 webviewView.webview.postMessage({
                    command: 'updateTextOnly',
                    errorCount: errorCount,
                    warningCount: warningCount,
                    weightedProblems: weightedProblems
                });
            }

        }, 1000);
    }

    getStaticHtml(webviewView, cssUri, initialFaceUri) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webviewView.webview.cspSource} 'unsafe-inline'; img-src ${webviewView.webview.cspSource} https:; media-src ${webviewView.webview.cspSource} https:; script-src 'unsafe-inline';">
                <link rel="stylesheet" href="${cssUri}">
                
                <style>
                    body {
                        height: 100vh; 
                        overflow: hidden; 
                        display: flex; 
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        margin: 0;
                        padding: 10px;
                        box-sizing: border-box;
                        position: relative;
                        color: var(--vscode-editor-foreground); /* Default VS Code text color */
                    }
                    .wrapper {
                        text-align: center;
                        width: 100%;
                    }
                    .doomFaces {
                        max-width: 100%; 
                        max-height: 80vh; 
                        height: auto;      
                        object-fit: contain;
                    }
                    #errorNum {
                        font-size: 1.5em; 
                        margin-top: 10px;
                        margin-bottom: 0px;
                        transition: color 0.2s ease-in-out; /* Smooth color change */
                    }
                    #warningNum {
                        font-size: 1em;
                        margin-top: 5px;
                        opacity: 0.7;
                        transition: color 0.2s ease-in-out; /* Smooth color change */
                    }
                    
                    /* Color Tiers matching the 10 Face Images (10 levels total) */
                    
                    /* Tier 0 (Image 1: 0-3 weighted problems) - Default */
                    .color-tier-0 { color: var(--vscode-editor-foreground); } 
                    
                    /* Tier 1 (Image 2: 4-7) - Yellow */
                    .color-tier-1 { color: #FFD700; opacity: 1; } 

                    /* Tier 2 (Image 3: 8-11) - Light Orange */
                    .color-tier-2 { color: #FFA500; opacity: 1; } 
                    
                    /* Tier 3 (Image 4: 12-15) - Orange Red */
                    .color-tier-3 { color: #FF6347; opacity: 1; } /* Tomato */
                    
                    /* Tier 4 (Image 5: 16-19) - Red */
                    .color-tier-4 { color: #FF0000; opacity: 1; } /* Red */

                    /* Tier 5 (Image 6: 20-23) - Darker Red */
                    .color-tier-5 { color: #CC0000; opacity: 1; } 
                    
                    /* Tier 6 (Image 7: 24-27) - Even Darker Red */
                    .color-tier-6 { color: #990000; opacity: 1; } 
                    
                    /* Tier 7 (Image 8: 28-31) - Deep Crimson */
                    .color-tier-7 { color: #8B0000; opacity: 1; } /* DarkRed */

                    /* Tier 8 (Image 9 & 10: 32+) - Darkest Red */
                    .color-tier-8 { color: #660000; opacity: 1; } 
                    
                    /* Helper button for the Audio Autoplay Policy (unchanged) */
                    #enableAudioBtn {
                        display: none; 
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 100;
                        padding: 15px 25px;
                        background: rgba(255, 0, 0, 0.8);
                        color: white;
                        border: 2px solid white;
                        font-weight: bold;
                        cursor: pointer;
                        border-radius: 5px;
                        font-family: sans-serif;
                    }
                    #enableAudioBtn:hover {
                        background: rgba(255, 0, 0, 1);
                    }
                </style>
            </head>
            <body>
                <button id="enableAudioBtn">🔇 Click to Enable Audio</button>
            
                <section class="wrapper">
                    <img id="doomFace" class="doomFaces" src="${initialFaceUri}" alt="Doom Face">
                    <h1 id="errorNum" class="color-tier-0">Checking...</h1>
                    <p id="warningNum" class="color-tier-0"></p>
                </section>
                
                <audio id="audioPlayer" src="" preload="auto" hidden></audio>

                <script>
                    const vscode = acquireVsCodeApi(); 

                    const doomFace = document.getElementById('doomFace');
                    const errorNum = document.getElementById('errorNum');
                    const warningNum = document.getElementById('warningNum');
                    const enableAudioBtn = document.getElementById('enableAudioBtn');
                    const audioPlayer = document.getElementById('audioPlayer'); 
                    
                    let state = vscode.getState();
                    let audioEnabled = state ? state.audioEnabled : false; 

                    if (audioEnabled) {
                        enableAudioBtn.style.display = 'none'; 
                    }
                    
                    // Handler for the "Unlock" button
                    enableAudioBtn.addEventListener('click', () => {
                        const playPromise = audioPlayer.play();
                        
                        if (playPromise !== undefined) {
                            playPromise.then(() => {
                                audioEnabled = true; 
                                enableAudioBtn.style.display = 'none';
                                vscode.setState({ audioEnabled: true }); 
                            }).catch(e => console.error("Unlock click failed:", e));
                        }
                    });

                    // Utility function to format the problem text
                    function updateProblemText(eCount, wCount) {
                        let errorText = eCount === 1 ? 'error' : 'errors';
                        let warningText = wCount === 1 ? 'warning' : 'warnings';
                        
                        errorNum.innerText = eCount + " " + errorText;
                        warningNum.innerText = wCount + " " + warningText;
                    }

                    // NEW: Function to set the color class based on weighted problems
                    function updateTextColor(weightedProblems) {
                        // Clear existing classes
                        errorNum.className = '';
                        warningNum.className = '';
                        
                        let tier = 'color-tier-0'; // Default Black (Image 1: 0-3)

                        // Tier 1 (Image 2: 4-7 problems)
                        if (weightedProblems >= 4) {
                            tier = 'color-tier-1'; 
                        } 
                        
                        // Tier 2 (Image 3: 8-11 problems)
                        if (weightedProblems >= 8) {
                            tier = 'color-tier-2';
                        }

                        // Tier 3 (Image 4: 12-15 problems)
                        if (weightedProblems >= 12) {
                            tier = 'color-tier-3';
                        }

                        // Tier 4 (Image 5: 16-19 problems)
                        if (weightedProblems >= 16) {
                            tier = 'color-tier-4';
                        }
                            
                        // Tier 5 (Image 6: 20-23 problems)
                        if (weightedProblems >= 20) {
                            tier = 'color-tier-5';
                        }

                        // Tier 6 (Image 7: 24-27 problems)
                        if (weightedProblems >= 24) {
                            tier = 'color-tier-6';
                        }
                            
                        // Tier 7 (Image 8: 28-31 problems)
                        if (weightedProblems >= 28) {
                            tier = 'color-tier-7';
                        }

                        // Tier 8 (Image 9 & 10: 32+ problems) - Darkest Red
                        if (weightedProblems >= 32) {
                            tier = 'color-tier-8';
                        }
                        
                        errorNum.classList.add(tier);
                        warningNum.classList.add(tier);
                    }


                    // Listen for messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        const eCount = message.errorCount;
                        const wCount = message.warningCount;
                        const wProblems = message.weightedProblems;
                        
                        updateTextColor(wProblems); // Update color on every text change
                        
                        if (message.command === 'updateFace') {
                            // Update Text
                            updateProblemText(eCount, wCount);
                            
                            // Update Image
                            doomFace.src = message.image;

                            // Update the static audio player's source
                            audioPlayer.src = message.audio;
                            audioPlayer.volume = 0.5;
                            
                            // Try to play
                            const playPromise = audioPlayer.play();
                            
                            if (playPromise !== undefined) {
                                playPromise.catch(error => {
                                    if (!audioEnabled && error.name === 'NotAllowedError') {
                                        console.log("Autoplay blocked. Waiting for user interaction.");
                                        enableAudioBtn.style.display = 'block';
                                    } else if (error.name === 'NotAllowedError') {
                                        console.warn("Autoplay blocked unexpectedly. Prompting click.");
                                        enableAudioBtn.style.display = 'block';
                                    } else {
                                        console.error("Audio play failed:", error);
                                    }
                                });
                            }
                        } 
                        else if (message.command === 'updateTextOnly') {
                            updateProblemText(eCount, wCount);
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}
CustomSidebarViewProvider.viewType = "in-your-face.openview";

// Calculates the total problem count, weighting warnings less than errors.
// 4 warnings = 1 error.
// @returns { { weightedProblems: number, errorCount: number, warningCount: number } }
function getWeightedProblemCount() {
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
        return { weightedProblems: 0, errorCount: 0, warningCount: 0 };
    }
    const document = activeTextEditor.document;
    let errorCount = 0;
    let warningCount = 0;
    
    for (const diagnostic of vscode.languages.getDiagnostics(document.uri)) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) { // 0 Error
            errorCount += 1;
        } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) { // 1 Warning
            warningCount += 1;
        }
    }
    
    // Calc weighted total: errors + (warnings / 4, rounded down)
    const weightedProblems = errorCount + Math.floor(warningCount / 4);
    
    return { weightedProblems, errorCount, warningCount };
}

function deactivate() { }
exports.deactivate = deactivate;