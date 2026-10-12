import { native, nativePlatform } from './native'
let selected = 9
export async function iconRequest(id?: number) {
  if (nativePlatform) return native.appIcon(id === undefined ? {} : { id })
  if (id !== undefined) selected = id
  return { selected, supported: false }
}

export const supportsSystemIcon = nativePlatform
