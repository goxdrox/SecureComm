/**
 * @format
 */
import 'react-native-get-random-values';
import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';
import 'react-native-url-polyfill/auto';

AppRegistry.registerComponent(appName, () => App);
