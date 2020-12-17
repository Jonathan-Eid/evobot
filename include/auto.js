const { MessageEmbed } = require("discord.js");
const YouTubeAPI = require("simple-youtube-api");
const scdl = require("soundcloud-downloader").default;
const { YOUTUBE_API_KEY, SOUNDCLOUD_CLIENT_ID, MAX_PLAYLIST_SIZE, DEFAULT_VOLUME, TEXTCHANNEL_ID, PLAYLIST_URL } = require("../util/EvobotUtil");
const youtube = new YouTubeAPI(YOUTUBE_API_KEY);



async function play(song, channel) {
  const { SOUNDCLOUD_CLIENT_ID } = require("../util/EvobotUtil");
  const textChannel = channel.client.channels.cache.get(TEXTCHANNEL_ID)

  let config;

  try {
    config = require("../config.json");
  } catch (error) {
    config = null;
  }

  const PRUNING = config ? config.PRUNING : process.env.PRUNING;
  const queue = channel.client.queue.get(channel.guild.id);

  if (!song) {
    if(channel.members.size > 1){
      console.log("REACHED THE END");
      module.exports.execute(channel)
      return;
    }
    setTimeout(function () {
      if (queue.connection.dispatcher && channel) return;
      queue.channel.leave();
      queue.textChannel.send("Leaving voice channel...");
    }, STAY_TIME * 1000);
    queue.textChannel.send("❌ Music queue ended.").catch(console.error);
    return channel.client.queue.delete(channel.guild.id);
  }

  let stream = null;
  let streamType = song.url.includes("youtube.com") ? "opus" : "ogg/opus";

  try {
    if (song.url.includes("youtube.com")) {
      stream = await ytdl(song.url, { highWaterMark: 1 << 25 });
    } else if (song.url.includes("soundcloud.com")) {
      try {
        stream = await scdl.downloadFormat(song.url, scdl.FORMATS.OPUS, SOUNDCLOUD_CLIENT_ID);
      } catch (error) {
        stream = await scdl.downloadFormat(song.url, scdl.FORMATS.MP3, SOUNDCLOUD_CLIENT_ID);
        streamType = "unknown";
      }
    }
  } catch (error) {
    if (queue) {
      queue.songs.shift();
      play(queue.songs[0], channel);
    }

    console.error(error);
    return //message.channel.send(`Error: ${error.message ? error.message : error}`);
  }

  queue.connection.on("disconnect", () => channel.client.queue.delete(channel.guild.id));

  const dispatcher = queue.connection
    .play(stream, { type: streamType })
    .on("finish", () => {
      if (collector && !collector.ended) collector.stop();

      if (queue.loop) {
        // if loop is on, push the song back at the end of the queue
        // so it can repeat endlessly
        let lastSong = queue.songs.shift();
        queue.songs.push(lastSong);
        play(queue.songs[0], channel);
      } else {
        // Recursively play the next song
        queue.songs.shift();
        play(queue.songs[0], channel);
      }
    })
    .on("error", (err) => {
      console.error(err);
      queue.songs.shift();
      play(queue.songs[0], channel);
    });
  dispatcher.setVolumeLogarithmic(queue.volume / 100);

  try {
    var playingMessage = await textChannel.send(`🎶 Started playing: **${song.title}** ${song.url}`);
    await playingMessage.react("⏭");
    await playingMessage.react("⏯");
    await playingMessage.react("🔇");
    await playingMessage.react("🔉");
    await playingMessage.react("🔊");
    await playingMessage.react("🔁");
    await playingMessage.react("⏹");
  } catch (error) {
    console.error(error);
  }

  const filter = (reaction, user) => user.id !== channel.client.user.id;
  var collector = playingMessage.createReactionCollector(filter, {
    time: song.duration > 0 ? song.duration * 1000 : 600000
  });

}

module.exports = {
  name: "auto",
  cooldown: 5,
  aliases: ["au"],
  description: "Play a playlist from youtube",
  async execute(channel) {
    const textChannel = channel.client.channels.cache.get(TEXTCHANNEL_ID)

    //const { channel } = CHANNEL_ID;
    const serverQueue = null //message.client.queue.get(message.guild.id);

    // if (!PLAYLIST_URL.length)
    //   return message
    //     .reply(`Usage: ${message.client.prefix}playlist <YouTube Playlist URL | Playlist Name>`)
    //     .catch(console.error);
    // if (!channel) return message.reply("You need to join a voice channel first!").catch(console.error);

    // const permissions = channel.permissionsFor(message.client.user);
    // if (!permissions.has("CONNECT"))
    //   return message.reply("Cannot connect to voice channel, missing permissions");
    // if (!permissions.has("SPEAK"))
    //   return message.reply("I cannot speak in this voice channel, make sure I have the proper permissions!");

    // if (serverQueue && channel !== message.guild.me.voice.channel)
    //   return message.reply(`You must be in the same channel as ${message.client.user}`).catch(console.error);

    const search = "";
    const pattern = /^.*(youtu.be\/|list=)([^#\&\?]*).*/gi;
    const url = PLAYLIST_URL;
    const urlValid = pattern.test(url);

    const queueConstruct = {
      //textChannel: message.channel,
      channel,
      connection: null,
      songs: [],
      loop: false,
      volume: DEFAULT_VOLUME || 100,
      playing: true
    };

    let playlist = null;
    let videos = [];

    if (urlValid) {
      try {
        playlist = await youtube.getPlaylist(url, { part: "snippet" });
        videos = await playlist.getVideos(MAX_PLAYLIST_SIZE || 10, { part: "snippet" });
      } catch (error) {
        console.error(error);
        return //message.reply("Playlist not found :(").catch(console.error);
      }
    } else if (scdl.isValidUrl(url)) {
      if (url.includes("/sets/")) {
        textChannel.send("⌛ fetching the playlist...");
        playlist = await scdl.getSetInfo(url, SOUNDCLOUD_CLIENT_ID);
        videos = playlist.tracks.map((track) => ({
          title: track.title,
          url: track.permalink_url,
          duration: track.duration / 1000
        }));
      }
    } else {
      try {
        const results = await youtube.searchPlaylists(search, 1, { part: "snippet" });
        playlist = results[0];
        videos = await playlist.getVideos(MAX_PLAYLIST_SIZE || 10, { part: "snippet" });
      } catch (error) {
        console.error(error);
        return //message.reply(error.message).catch(console.error);
      }
    }

    const newSongs = videos.map((video) => {
      return (song = {
        title: video.title,
        url: video.url,
        duration: video.durationSeconds
      });
    });

    for (let i = newSongs.length - 1; i >= 0; i--) {
      let j = 1 + Math.floor(Math.random() * i);
      [newSongs[i], newSongs[j]] = [newSongs[j], newSongs[i]];
    }


    serverQueue ? serverQueue.songs.push(...newSongs) : queueConstruct.songs.push(...newSongs);
    let songs = serverQueue ? serverQueue.songs : queueConstruct.songs;


    let playlistEmbed = new MessageEmbed()
      .setTitle(`${playlist.title}`)
      .setDescription(songs.map((song, index) => `${index + 1}. ${song.title}`))
      .setURL(playlist.url)
      .setColor("#F8AA2A")
      .setTimestamp();

    if (playlistEmbed.description.length >= 2048)
      playlistEmbed.description =
        playlistEmbed.description.substr(0, 2007) + "\nPlaylist larger than character limit...";

    //message.channel.send(`${message.author} Started a playlist`, playlistEmbed);

    if (!serverQueue) {
      channel.client.queue.set(channel.guild.id, queueConstruct);

      try {
        queueConstruct.connection = await channel.join();
        await queueConstruct.connection.voice.setSelfDeaf(true);
        play(queueConstruct.songs[0], channel);
      } catch (error) {
        console.error(error);
        //message.client.queue.delete(message.guild.id);
        await channel.leave();
        return //message.channel.send(`Could not join the channel: ${error.message}`).catch(console.error);
      }
    }
  }
};
