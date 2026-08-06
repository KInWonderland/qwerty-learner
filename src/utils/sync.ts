import { db } from './db'
import { api } from '@/api/client'

export type SyncRecordTable = 'wordRecords' | 'chapterRecords' | 'reviewRecords' | 'revisionDictRecords' | 'revisionWordRecords'

export type SyncData = {
  settings: { key: string; value: string | null }[]
  records: Partial<Record<SyncRecordTable, unknown[]>>
}

// 将浏览器端全部数据推送到 SQLite; replace=true 时先清空服务器数据(导入备份场景)
export async function pushAllData(replace = false): Promise<void> {
  const data = await collectLocalData()
  await api.putData(data, replace)
}

// 收集浏览器端全部数据: localStorage 所有键 + IndexedDB 全部表
export async function collectLocalData(): Promise<SyncData> {
  const settings: { key: string; value: string | null }[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || key === getTokenKey()) continue
    settings.push({ key, value: window.localStorage.getItem(key) })
  }

  const records: Partial<Record<SyncRecordTable, unknown[]>> = {}
  for (const table of db.tables) {
    records[table.name as SyncRecordTable] = await table.toArray()
  }

  return { settings, records }
}

// 将 SQLite 中的数据写回浏览器端(localStorage + IndexedDB)
export async function applyRemoteData(data: SyncData): Promise<void> {
  // 只写入服务器数据, 不清理本地已有内容, 避免与运行中的应用写入竞争导致数据丢失
  for (const item of data.settings || []) {
    if (!item || item.key === getTokenKey()) continue
    if (item.value == null) {
      window.localStorage.removeItem(item.key)
    } else {
      window.localStorage.setItem(item.key, item.value)
    }
  }

  const records = data.records || {}
  for (const table of db.tables) {
    const rows = records[table.name as SyncRecordTable]
    if (Array.isArray(rows) && rows.length > 0) {
      // 保留原 id, 保证 chapterRecords.wordRecordIds 引用仍然有效; 合并而非清空
      await table.bulkPut(rows)
    }
  }
}

function getTokenKey() {
  return 'qwerty.learner.token'
}
