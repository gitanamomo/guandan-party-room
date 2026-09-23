// 测试登录功能
const http = require('node:http');

async function testServer() {
    console.log('🧪 测试服务器连接...');
    
    try {
        // 测试服务器是否运行
        const response = await fetch('http://localhost:8769/');
        if (response.ok) {
            console.log('✅ 服务器正常运行');
        } else {
            console.log('❌ 服务器响应异常');
        }
    } catch (error) {
        console.log('❌ 无法连接到服务器:', error.message);
        console.log('💡 请确保运行了: node server.cjs');
        return false;
    }
    
    // 测试创建房间API
    try {
        console.log('🧪 测试创建房间...');
        const response = await fetch('http://localhost:8769/api/create', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: '测试玩家',
                password: 'gina'
            })
        });
        
        const data = await response.json();
        
        if (data.ok) {
            console.log('✅ 创建房间成功');
            console.log('房间号:', data.state.code);
            console.log('Token:', data.token);
            
            // 测试加入房间
            console.log('🧪 测试加入房间...');
            const joinResponse = await fetch('http://localhost:8769/api/join', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name: '第二个玩家',
                    code: data.state.code,
                    password: 'gina'
                })
            });
            
            const joinData = await joinResponse.json();
            if (joinData.ok) {
                console.log('✅ 加入房间成功');
                return true;
            } else {
                console.log('❌ 加入房间失败:', joinData.error);
            }
        } else {
            console.log('❌ 创建房间失败:', data.error);
        }
    } catch (error) {
        console.log('❌ API测试失败:', error.message);
    }
    
    return false;
}

// 运行测试
testServer().then(success => {
    if (success) {
        console.log('🎉 所有测试通过！');
    } else {
        console.log('⚠️  请检查服务器是否正常运行');
    }
}).catch(error => {
    console.log('💥 测试过程出错:', error.message);
});