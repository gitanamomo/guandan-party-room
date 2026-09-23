// Simple syntax test
try {
    eval("console.log('test');");
    console.log("Basic syntax is working");
} catch(e) {
    console.error("Basic syntax error:", e);
}