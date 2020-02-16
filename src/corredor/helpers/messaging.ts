import { extractID, genericPermissionUpdater, isFresh, PermissionRule, kv, ListResponse } from './shared'
import { Messaging as MessagingAPI } from '../../api-clients'
import { Channel, Message } from '../../messaging/'
import { User } from '../../system'
import { IsCortezaID } from '../../cast'

interface MessagingContext {
  MessagingAPI: MessagingAPI;
  $authUser?: User;
  $channel?: Channel;
  $message?: Message;
}

interface ChannelListFilter {
  [key: string]: string|undefined;
  query?: string;
}

/**
 * MessagingHelper provides layer over Messaging API and utilities that simplify automation script writing
 *
 */
export default class MessagingHelper {
  readonly MessagingAPI: MessagingAPI;
  readonly $authUser?: User;
  readonly $channel?: Channel;
  readonly $message?: Message;

  constructor (ctx: MessagingContext) {
    this.MessagingAPI = ctx.MessagingAPI

    this.$authUser = ctx.$authUser

    this.$channel = ctx.$channel
    this.$message = ctx.$message
  }

  /**
   * Sends message to Messaging channel or another user
   *
   * @example
   * // Script that greats all and every member in every channel
   * Messaging.findChannels().then(channels => {
   *   channels.forEach(async ch => {
   *     await Messaging.sendMessage('Hello members of ' + ch.name, ch)
   *
   *     for (let memberID of ch.members) {
   *       await System.findUserByID(memberID).then(u => {
   *         return Messaging.sendMessage(' ... and hello to you too ' + (u.name || u.email || u.handle), ch)
   *       })
   *     }
   *   })
   * })
   *
   * @param message - string or Message object
   * @param ch - User, Channel object or ID
   */
  async sendMessage (message: string|Message, ch: string|Channel|User): Promise<Message> {
    if (ch instanceof User) {
      ch = await this.directChannel(ch)
    }

    return this.resolveChannel(ch, this.$channel).then(ch => {
      let m: Message
      if (typeof message === 'string') {
        m = new Message({ message })
      } else {
        m = new Message(message)
      }

      m.channelID = ch.channelID
      return this.MessagingAPI
        .messageCreate(kv(message))
        .then(m => new Message(m))
    })
  }

  /**
   * Searches for channels
   *
   * @param filter
   */
  async findChannels (filter: string|ChannelListFilter): Promise<ListResponse<ChannelListFilter, Channel[]>> {
    if (typeof filter === 'string') {
      filter = { query: filter }
    }

    return this.MessagingAPI.channelList(filter).then(res => {
      if (!Array.isArray(res.set) || res.set.length === 0) {
        throw new Error('channel not found')
      }

      res.set = res.set.map(m => new Channel(m))
      return res as unknown as ListResponse<ChannelListFilter, Channel[]>
    })
  }

  /**
   * Finds user by ID
   *
   * @param channel
   */
  async findChannelByID (channel: string|Channel): Promise<Channel> {
    const channelID = extractID(channel, 'channelID')
    return this.MessagingAPI.channelRead({ channelID }).then(r => new Channel(r))
  }

  /**
   * Creates direct channel between current and
   *
   * @param first user - object or string with ID
   * @param [second] user - object or string with ID, defaults to current user
   */
  async directChannel (first: User|object|string, second: User|string|undefined = this.$authUser): Promise<Channel> {
    const firstUserID = extractID(first, 'userID')
    const secondUserID = extractID(second, 'userID')

    if (firstUserID === secondUserID) {
      return Promise.reject(Error('can not send message to self'))
    }

    // Create a new group channel between users
    // backend will handle checks (unique)
    return this.saveChannel({
      type: 'group',
      members: [firstUserID, secondUserID],
    } as Channel)
  }

  /**
   * Creates or updates a channel
   *
   * @example
   * saveChannel(new Channel({
   *   name: 'Foo',
   *   type: 'private', // public, group, private
   *   // members: ['231414', '231414', '231414'],
   * }))
   *
   *
   * @param channel
   */
  async saveChannel (channel: Channel): Promise<Channel> {
    return Promise.resolve(channel).then(channel => {
      if (isFresh(channel.channelID)) {
        return this.MessagingAPI.channelCreate(kv(channel)).then(channel => new Channel(channel))
      } else {
        return this.MessagingAPI.channelUpdate(kv(channel)).then(channel => new Channel(channel))
      }
    })
  }

  /**
   * Deletes a channel
   *
   * @example
   * System.findChannelByID('9043824038').then(user => {
   *   return System.deleteUser(user)
   * })
   *
   * @param channel
   async deleteChannel (channel: Channel): Promise<unknown> {
     return Promise.resolve(channel).then(channel => {
       const channelID = extractID(channel, 'channelID')

       if (!isFresh(channelID)) {
         return this.MessagingAPI.channelDelete({ channelID })
        }
      })
    }
  */

  /**
   * Resolves channels from the arguments and returns first valid
   *
   * Knows how to resolve from:
   *  - string that looks like an ID - find by id (fallback to find-by-handle)
   *  - string - find by handle
   *  - Channel object
   *  - object with channelID properties
   */
  async resolveChannel (...args: unknown[]): Promise<Channel> {
    for (let c of args) {
      // Resolve pending promises if any...
      c = await c

      if (!c) {
        continue
      }

      if (typeof c === 'string') {
        if (IsCortezaID(c)) {
          // Looks like an ID, try to find it and fall back to handle
          return this.findChannelByID(c)
        }
      }

      if (typeof c !== 'object') {
        continue
      }

      if (c instanceof Channel) {
        // Already got what we need
        return c
      }

      // Other kind of object with properties that might hold channel ID
      const {
        channelID,
      } = c as { channelID?: string }
      return this.resolveChannel(channelID)
    }

    return Promise.reject(Error('unexpected input type for channel resolver'))
  }

  /**
   * Sets permissions on messaging resources
   *
   * @example
   * Compose.setPermissions([
   *   // Allow someRole update to delete newChannel
   *   new AllowAccess(someRole, newChannel, 'delete'),
   *
   *   // Allow newRole to update any channel
   *   new AllowAccess(newRole, new WildcardResource(new Channel), 'update')
   * ])
   *
   * @param rules
   */
  async setPermissions (rules: PermissionRule[]): Promise<void> {
    return genericPermissionUpdater(this.MessagingAPI, rules)
  }
}