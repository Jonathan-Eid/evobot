/**
 * Module Imports
 */
const { Client, Collection, DiscordAPIError, Message } = require("discord.js");
const { readdirSync } = require("fs");
const { join } = require("path");
const { TOKEN, PREFIX, CHANNEL_ID, TEXTCHANNEL_ID } = require("./util/EvobotUtil");

const client = new Client({ disableMentions: "everyone" });
const auto = require("./include/auto")

client.login(TOKEN);
client.commands = new Collection();
client.prefix = PREFIX;
client.queue = new Map();
const cooldowns = new Collection();
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Client Events
 */
client.on("ready", () => {
  console.log(`${client.user.username} ready!`);
  client.user.setActivity(`${PREFIX}help and ${PREFIX}play`, { type: "LISTENING" });
});
client.on("warn", (info) => console.log(info));
client.on("error", console.error);

/**
 * Import all commands
 */
const commandFiles = readdirSync(join(__dirname, "commands")).filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
  const command = require(join(__dirname, "commands", `${file}`));
  client.commands.set(command.name, command);
}

client.on("voiceStateUpdate", async (oldState, newState) => {

  console.log("Old State: " + JSON.stringify(oldState));
  console.log("New State: " + JSON.stringify(newState));
  console.log("New Channel: " + JSON.stringify(newState.channel));

  if(newState.id == TOKEN){return ;}

  if(oldState.channelID == CHANNEL_ID && (newState.channelID != CHANNEL_ID || newState.channel == null)){
    let channel = oldState.channel
    let members = channel.members
    console.log("MEMBERS SIZE: " + members.size);
    let foundBot = members.find(user => {
      console.log(user.user.id);
      return (user.user.id == client.user.id)
    })
    if(members.size == 1 && foundBot){
      channel.leave();
    }

  }

  if(newState.channelID == CHANNEL_ID){
    let channel = newState.channel
    let members = channel.members
    console.log("CLIENT ID: " + JSON.stringify(    client.user.id))

    console.log("Members: " + JSON.stringify(members))
    let foundBot = members.find(user => {
      console.log(user.user.id);
      return (user.user.id == client.user.id)
    })
    if (!foundBot){
      auto.execute(channel)

    }

  }

})

client.on("message", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const prefixRegex = new RegExp(`^(<@!?${client.user.id}>|${escapeRegex(PREFIX)})\\s*`);
  if (!prefixRegex.test(message.content)) return;

  const [, matchedPrefix] = message.content.match(prefixRegex);

  const args = message.content.slice(matchedPrefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command =
    client.commands.get(commandName) ||
    client.commands.find((cmd) => cmd.aliases && cmd.aliases.includes(commandName));

  if (!command) return;

  if (!cooldowns.has(command.name)) {
    cooldowns.set(command.name, new Collection());
  }

  const now = Date.now();
  const timestamps = cooldowns.get(command.name);
  const cooldownAmount = (command.cooldown || 1) * 1000;

  if (timestamps.has(message.author.id)) {
    const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return message.reply(
        `please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`
      );
    }
  }

  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

  try {
    command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.reply("There was an error executing that command.").catch(console.error);
  }
});
