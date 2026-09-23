// 测试异地访问功能
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

console.log('测试异地访问功能...');

// 检查房间创建逻辑
function testRoomCreation() {
    console.log('\n=== 测试房间创建逻辑 ===');
    
    // 模拟房间创建请求
    const mockRoom = {
        code: '123456',
        players: [null, null, null, null], // 初始都为null
        game: null,
        updated: Date.now()
    };
    
    // 模拟玩家0加入
    const token = 'test-token-123';
    mockRoom.players[0] = {
        name: '房主',
        token: token,
        ready: false,
        lastSeen: Date.now()
    };
    
    console.log('房间创建后的状态:', mockRoom);
    console.log('空座位数量:', mockRoom.players.filter(p => p === null).length);
    
    // 测试第二个玩家加入
    const secondSeat = mockRoom.players.findIndex(x => x === null);
    console.log('第二个玩家可以加入的座位:', secondSeat);
    
    if (secondSeat >= 0) {
        mockRoom.players[secondSeat] = {
            name: '玩家2',
            token: 'test-token-456',
            ready: false,
            lastSeen: Date.now()
        };
        console.log('第二个玩家加入后的状态:', mockRoom);
        console.log('空座位数量:', mockRoom.players.filter(p => p === null).length);
    }
}

// 测试服务器地址生成
function testServerUrl() {
    console.log('\n=== 测试服务器地址生成 ===');
    
    const testHosts = ['localhost', '127.0.0.1', '192.168.1.100', 'example.com'];
    
    testHosts.forEach(host => {
        const protocol = location?.protocol === 'https:' ? 'https:' : 'http:';
        const url = `${protocol}//${host}:8769`;
        console.log(`主机: ${host} -> 地址: ${url}`);
    });
}

testRoomCreation();
testServerUrl();

console.log('\n✅ 异地访问功能测试完成');