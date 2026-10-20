import fs from 'node:fs'
import { messagesFromXml, detectProfile } from '../src/lib/parser.js'
console.log(detectProfile(messagesFromXml(fs.readFileSync(process.argv[2], 'utf8'))))
