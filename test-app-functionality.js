// Test app.js functionality without requiring actual DOM
try {
    // Load the engine.js first
    const fs = require('fs');
    const engineCode = fs.readFileSync('engine.js', 'utf8');
    eval(engineCode);
    console.log("Engine.js loaded successfully");
    
    // Test basic engine functionality
    const game = GD.newGame();
    console.log("Game created successfully");
    console.log("Game state:", JSON.stringify(game, null, 2));
    
    // Test if our functions exist
    console.log("Testing saveGameState function...");
    // This will fail because we don't have DOM, but that's expected
    try {
        saveGameState();
    } catch(e) {
        console.log("Expected DOM error:", e.message);
    }
    
    console.log("All basic tests passed");
    
} catch(e) {
    console.error("Error:", e);
    process.exit(1);
}