import {AppRegistry} from 'react-native'
import 'react-native-get-random-values'
import 'react-native-url-polyfill/auto'
import {name as appName} from './app.json'
import {App} from './src/app'

// Disable the red error overlay in dev — errors go to Metro terminal instead
if (__DEV__) {
  const originalHandler = ErrorUtils.getGlobalHandler()
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error(isFatal ? '[FATAL]' : '[ERROR]', error?.message || error)
    // Don't call original handler — that's what shows the overlay
  })
}

AppRegistry.registerComponent(appName, () => App)
