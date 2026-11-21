# 测试反模式

**在以下情况加载此参考：** 编写或修改测试、添加 mock、或想在生产代码中添加仅测试用方法时。

## 概述

测试必须验证真实行为，而非 mock 行为。Mock 是隔离的手段，不是被测试的对象。

**核心原则：** 测试代码做了什么，而非 mock 做了什么。

**严格遵循 TDD 可以防止这些反模式。**

## 铁律

```
1. 绝不测试 mock 行为
2. 绝不在生产类中添加仅测试用的方法
3. 绝不在不理解依赖的情况下使用 mock
```

## 反模式 1：测试 Mock 行为

**违规做法：**
```typescript
// ❌ 差：测试 mock 是否存在
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**为什么这是错误的：**
- 你在验证 mock 能工作，而非组件能工作
- mock 存在时测试通过，不存在时失败
- 对真实行为一无所知

**正确做法：**
```typescript
// ✅ 好：测试真实组件或不要 mock 它
test('renders sidebar', () => {
  render(<Page />);  // 不要 mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

### 门控函数

```
在对任何 mock 元素做断言之前：
  问："我是在测试真实组件行为还是仅仅测试 mock 的存在？"

  如果是测试 mock 的存在：
    停下——删除断言或取消 mock

  改为测试真实行为
```

## 反模式 2：在生产代码中添加仅测试用方法

**违规做法：**
```typescript
// ❌ 差：destroy() 仅在测试中使用
class Session {
  async destroy() {  // 看起来像生产 API！
    await this._workspaceManager?.destroyWorkspace(this.id);
  }
}

// 在测试中
afterEach(() => session.destroy());
```

**正确做法：**
```typescript
// ✅ 好：测试工具处理测试清理
// Session 没有 destroy()——它在生产中是无状态的

// 在 test-utils/ 中
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// 在测试中
afterEach(() => cleanupSession(session));
```

## 反模式 3：不理解依赖就使用 Mock

**违规做法：**
```typescript
// ❌ 差：Mock 破坏了测试逻辑
test('detects duplicate server', () => {
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // 应该抛异常——但不会！
});
```

**正确做法：**
```typescript
// ✅ 好：在正确的层级 mock
test('detects duplicate server', () => {
  vi.mock('MCPServerManager'); // 只 mock 慢的服务器启动

  await addServer(config);  // 配置被写入
  await addServer(config);  // 检测到重复 ✓
});
```

## 反模式 4：不完整的 Mock

**铁律：** Mock 真实存在的完整数据结构，而非只包含你当前测试用到的字段。

**正确做法：**
```typescript
// ✅ 好：镜像真实 API 的完整性
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // 真实 API 返回的所有字段
};
```

## 反模式 5：集成测试作为事后补充

**正确做法：**
```
TDD 循环：
1. 编写失败的测试
2. 实现使其通过
3. 重构
4. 然后才声称完成
```

## 快速参考

| 反模式 | 修复方式 |
|--------|----------|
| 对 mock 元素做断言 | 测试真实组件或取消 mock |
| 生产代码中的仅测试用方法 | 移到测试工具中 |
| 不理解就 mock | 先理解依赖，最少 mock |
| 不完整的 mock | 完整镜像真实 API |
| 测试作为事后补充 | TDD——先写测试 |
| 过于复杂的 mock | 考虑集成测试 |

## 危险信号

- 断言检查 `*-mock` test ID
- 方法仅在测试文件中被调用
- Mock setup 占测试的 >50%
- 移除 mock 测试就失败
- 无法解释为什么需要 mock
- "保险起见" mock 掉

## 底线

**Mock 是隔离的工具，不是被测试的对象。**

如果 TDD 揭示你在测试 mock 行为，你已经走偏了。

修复方法：测试真实行为，或质疑为什么要 mock。