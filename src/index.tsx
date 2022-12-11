import { Bot, Context, Logger, Schema } from 'koishi'
import type {} from 'koishi-plugin-rasa-nlg-dict'

export const name = 'acs'

export const using = ['rasanlg'] as const

export interface Config {
  service: {
    target: string[]
  }
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    service: Schema.object({
      target: Schema.array(String).required().description('要监听的目标频道。'),
    }),
  }).description('服务'),
])

interface Message {
  id: number
  bot: Bot<Bot.Config>
  guildId: string | undefined
  channelId: string
  messageId: string | undefined
  content: string
  candidates: string[]
}

export function apply(ctx: Context, config: Config) {
  const logger = new Logger('acs')
  const db: Message[] = []

  let index = 0

  ctx.on('message', (session) => {
    if (
      !session.channelId ||
      !config.service.target.includes(session.channelId)
    )
      return

    ctx.rasanlg.generateCandidates(session.content).then((candidates) => {
      const id = index
      index++

      db.push({
        id,
        bot: session.bot,
        guildId: session.guildId,
        channelId: session.channelId as string,
        messageId: session.messageId,
        content: session.content,
        candidates: candidates.map((x) => x.intent),
      })
    })
  })

  ctx.command('acs', '自动客户服务', { authority: 4 })

  ctx.command('acs.list [n:number]', '查看消息队列').action((_, n) => {
    const size = n ? n : 10

    if (!db.length) return '队列为空——干得不错！'

    logger.info(db)

    // return (
    //   <message forward>
    //     <message>显示队列中最旧的 {size} 条消息：</message>
    //     {db.slice(0, size).map((x) => (
    //       <message>
    //         ID：{x.id}\n内容：{x.content}\n可选回复：{x.candidates.join('|')}
    //       </message>
    //     ))}
    //   </message>
    // )

    return `
      <message forward>
        <message>显示队列中最旧的 ${size} 条消息：</message>
        ${db
          .slice(0, size)
          .map(
            (x) =>
              `<message>
            ID：${x.id}\n内容：${x.content}\n可选回复：${x.candidates.join('|')}
          </message>`
          )
          .join('')}
      </message>
    `
  })

  ctx
    .command('acs.do <id:number> <op:string>', '对消息执行操作')
    .action((_, id, op) => {
      const messageIndex = db.findIndex((x) => x.id === id)
      if (messageIndex < 0) return `消息 ${id} 不存在。`
      const message = db[messageIndex]

      if (op === 'q') {
        db.splice(messageIndex, 1)
        return
      }

      if (!ctx.rasanlg.dictionary[op]) return `未知意图：${op}`

      setTimeout(() => {
        message.bot.sendMessage(
          message.channelId,
          // <message>
          //   <quote id={message.messageId} />
          //   {ctx.rasanlg.dictionary[op]}
          // </message>,
          `<message>
            <quote id="${message.messageId}" />
            ${ctx.rasanlg.dictionary[op]}
          </message>`,
          message.guildId
        )
      }, 1000)
      db.splice(messageIndex, 1)
      return `消息 ${id} 应答意图 ${op}。`
    })
}
