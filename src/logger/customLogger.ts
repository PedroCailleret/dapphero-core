import * as consts from 'consts'
import Axios from 'axios'

const axios = Axios.create({ headers: { 'content-type': 'application/json' } })

export class DappHeroLogger {
  private axios = Axios.create({ headers: { 'content-type': 'application/json' } })

  private token = consts.loggly.token

  private stringifyParams = (params) => {
    const stringifiedParams = params.map((item) => {
      try {
        return JSON.stringify(item, null, 2)
      } catch {
        return item.toString()
      }
    })
    return stringifiedParams
  }

  debug = (...params) => {
    console.log(...params) // eslint-disable-line
    const json = {
      message: params.length === 1 ? params[0] : this.stringifyParams(params),
      // message: "hello"
    }
    // console.log(JSON.stringify(json))
    this.axios({
      method: 'post',
      url: `http://logs-01.loggly.com/inputs/${this.token}/tag/http/`,
      data: JSON.stringify(json),
    })
  }

  log = (level, ...rest) => {
    const json = {
      level,
      timeStamp: new Date().toString(),
      message: rest.length === 1 ? rest[0] : this.stringifyParams(rest),
    }
    this.axios.post(`http://logs-01.loggly.com/inputs/${this.token}/tag/http/`, json)
  }

  info = (first, ...rest) => {}

  warn = (first, ...rest) => {}

  error = (first, ...rest) => {}

}

export const logger = new DappHeroLogger()

