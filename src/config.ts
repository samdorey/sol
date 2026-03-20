import {LogBox} from 'react-native'
import Fuse, {IFuseOptions} from 'fuse.js'

LogBox.ignoreAllLogs(true)

export const FUSE_OPTIONS: IFuseOptions<any> = {
  threshold: 0.15,
  ignoreLocation: true,
  findAllMatches: true,
  keys: [
    {name: 'name', weight: 0.9},
    {name: 'alias', weight: 0.1},
  ],
}
