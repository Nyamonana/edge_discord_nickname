const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// --- 設定 ---
const TARGET_SERVER_ID = '630808399881437254'; // 監視対象サーバーID
const NICKNAME_FILE_PATH = 'nickname.txt';      // ニックネームリストファイル
const NICKNAME_ON_LEAVE = '風吹けば名無し';      // VC退出時ニックネーム
const NAME_MODE_PREFIX = '風吹けば';             // 名前モード接頭辞
const COMMAND_PREFIX = '!';                     // コマンド接頭辞
const SETMODE_COMMAND = 'setmode';              // モード設定コマンド
const DISCORD_NICKNAME_MAX_LENGTH = 32;         // Discordニックネーム最大長
// --- 設定完了 ---

// --- 状態管理 ---
let currentMode = 'random'; // 'random' or 'name'
let nicknamesFromFile = []; // ニックネームリスト
// --- 状態管理完了 ---

// --- 関数 ---

// ニックネームリストをファイルから読み込む
function loadNicknames() {
    try {
        const data = fs.readFileSync(NICKNAME_FILE_PATH, 'utf8');
        nicknamesFromFile = data.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        　
        console.log(`[情報] ${nicknamesFromFile.length}個のニックネームを ${NICKNAME_FILE_PATH} からロードした`);
        if (nicknamesFromFile.length === 0) {
            　
            console.warn(`[警告] ${NICKNAME_FILE_PATH} が空か、有効なニックネームが含まれていない。ランダムモードが機能しない可能性有`);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            　
            console.error(`[エラー] ニックネームファイルが見つからない: ${NICKNAME_FILE_PATH}`);
            console.log('[情報] 空のニックネームリストを使用');
        } else {
            　
            console.error(`[エラー] ${NICKNAME_FILE_PATH} の読み込み中にエラーが発生`, error);
        }
        nicknamesFromFile = [];
    }
}

// メンバーのニックネームを設定
async function setMemberNickname(member, nickname) {
    if (!member || member.user.bot || member.nickname === nickname) return;

    if (!member.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        　
        console.warn(`[警告] BOTにニックネーム変更権限がない`);
        return;
    }
    if (!member.manageable) {
        　
        console.warn(`[警告] ${member.user.tag} (${member.id}) のニックネームを変更できない。サーバーオーナー/もしくは上位の役職を持っている`);
        return;
    }

    let finalNickname = nickname;
    if (nickname && nickname.length > DISCORD_NICKNAME_MAX_LENGTH) {
        　
        console.warn(`[警告] 対象userニックネーム文字数が上限値のため切り捨て`);
        // finalNickname = nickname.slice(0, DISCORD_NICKNAME_MAX_LENGTH); // 必要なら有効化
    }

    try {
        const oldNickname = member.nickname || member.user.displayName;
        await member.setNickname(finalNickname, `VC参加/退出またはモード変更のため`);
        　
        console.log(`[情報] ${member.user.tag} のニックネームを "${oldNickname}" から "${finalNickname || '(リセット)'}" に変更 (サーバー: ${member.guild.name})。`);
    } catch (error) {
        　
        console.error(`[エラー] ${member.user.tag} のニックネームを "${finalNickname}" に設定できず`, error.message);
        if (error.code === 50013) {
            　
             console.error(`[エラー詳細] BOTに権限がないか、役職の階層が ${member.user.tag} より低いため操作不可能`);
        }
    }
}

// --- クライアント初期化 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.GuildMember, Partials.Channel]
});

// --- イベントハンドラ ---

// Bot準備完了
client.once('ready', c => {
    　
    console.log(`[情報] BOT: ${c.user.tag} login`);
    console.log(`[情報] 現在のモード: ${currentMode}`);
    console.log(`[情報] cmd prefix: ${COMMAND_PREFIX}`);
    loadNicknames();
});

// ボイス状態更新
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.guild.id !== TARGET_SERVER_ID && oldState.guild.id !== TARGET_SERVER_ID) return;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const joinedVC = !oldState.channelId && newState.channelId;
    const leftVC = oldState.channelId && !newState.channelId;

    // VC参加時
    if (joinedVC) {
        　
        console.log(`[VC参加] ${member.user.tag} が ${newState.channel.name} に参加(モード: ${currentMode})。`);
        let newNickname = '';

        if (currentMode === 'random') {
            if (nicknamesFromFile.length === 0) {
                　
                console.warn('[警告] 利用可能なニックネームがない');
                return;
            }
            try {
                await newState.guild.members.fetch();
                const currentNicknamesSet = new Set(newState.guild.members.cache.filter(m => m.id !== member.id && m.nickname).map(m => m.nickname));
                const availableNicknames = nicknamesFromFile.filter(nick => !currentNicknamesSet.has(nick));

                if (availableNicknames.length === 0) {
                    　
                    console.warn(`[警告] ${member.user.tag} ファイル内全てのニックネームが使用されている`);
                    return; // フォールバック無し
                }
                newNickname = availableNicknames[Math.floor(Math.random() * availableNicknames.length)];
            } catch (error) {
                　
                console.error('[エラー] ランダムニックネーム選択中にエラー', error);
                return;
            }
        } else if (currentMode === 'name') {
            const userAccountDisplayName = member.user.displayName ?? member.user.username;
            newNickname = `${NAME_MODE_PREFIX}${userAccountDisplayName}`;
            　
            console.log(`[情報 name mode] ${member.user.tag} 表示名 "${userAccountDisplayName}" を使用`);
        }

        if (newNickname) await setMemberNickname(member, newNickname);

    // VC退出時
    } else if (leftVC) {
         　
        console.log(`[VC退出] ${member.user.tag} が ${oldState.channel.name} から退出`);
        if (!member.voice.channel) { // サーバー内のVCから完全に退出
            　
             console.log(`[情報] ${member.user.tag} がVC退出、ニックネームリセット`);
             await setMemberNickname(member, NICKNAME_ON_LEAVE);
        } else {
            　
             console.log(`[情報] ${member.user.tag} が別VCへ移動`);
        }
    }
});

// メッセージ受信
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild || !message.content.startsWith(COMMAND_PREFIX)) return;
    if (message.guild.id !== TARGET_SERVER_ID) return;

    const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (command === SETMODE_COMMAND) {
        // 権限チェック
        if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            　
            await message.reply('コマンドを実行する権限がない');
            　
            console.log(`[権限エラー] ${message.author.tag} が ${COMMAND_PREFIX}${SETMODE_COMMAND} を実行しようとしましたが、管理者権限がありません。`);
            return;
        }

        const modeArgRaw = args[0];
        if (!modeArgRaw) {
            　
            await message.reply(
                `モードを指定してください\n` +
                `\`${COMMAND_PREFIX}${SETMODE_COMMAND} 0\` または \`${COMMAND_PREFIX}${SETMODE_COMMAND} random\` : ランダムモード\n` +
                `\`${COMMAND_PREFIX}${SETMODE_COMMAND} 1\` または \`${COMMAND_PREFIX}${SETMODE_COMMAND} name\` : 表示名ベースモード`
            );
            return;
        }

        const modeArg = modeArgRaw.toLowerCase();
        let newModeAssigned = false;
        let replyMessage = '';
        let logMessage = '';
        let modeIdentifier = '';

        // Randomモード ('0' or 'random')
        if (modeArg === '0' || modeArg === 'random') {
            if (currentMode !== 'random') {
                currentMode = 'random';
                loadNicknames();
                modeIdentifier = 'random (0)';
                　
                replyMessage = `モードを **ランダムモード (${modeIdentifier})** に設定`;
                　
                logMessage = `[情報] ${message.author.tag} によりモードが ${currentMode} / ${modeIdentifier} に変更された`;
                newModeAssigned = true;
            } else {
                　
                replyMessage = `既に **ランダムモード (random / 0)** に設定されています。`;
                await message.reply(replyMessage);
                return;
            }
        }
        // Nameモード ('1' or 'name')
        else if (modeArg === '1' || modeArg === 'name') {
            if (currentMode !== 'name') {
                currentMode = 'name';
                modeIdentifier = 'name (1)';
                 　
                replyMessage = `モードを **表示名ベース ${modeIdentifier}** に設定`;
                 　
                logMessage = `[情報] ${message.author.tag} によりモードが ${currentMode} / ${modeIdentifier} に変更された`;
                newModeAssigned = true;
            } else {
                replyMessage = `既に **表示名ベースモード (name / 1)** に設定されています。`;
                await message.reply(replyMessage);
                return;
            }
        }

        if (newModeAssigned) {
            await message.reply(replyMessage);
            console.log(logMessage);
        } else if (!replyMessage) { // 引数が無効な場合
            await message.reply(
                `モード指定が無効\n`+
                `\`${COMMAND_PREFIX}${SETMODE_COMMAND} 0\` または \`${COMMAND_PREFIX}${SETMODE_COMMAND} random\` : ランダムモード\n` +
                `\`${COMMAND_PREFIX}${SETMODE_COMMAND} 1\` または \`${COMMAND_PREFIX}${SETMODE_COMMAND} name\` : 表示名ベースモード\n`+
                `のように指定しなさい`
            );
        }
    }
});

// --- ログイン ---
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error("BOT Tokenが.envファイルに設定されていない DISCORD_BOT_TOKEN='ここにtokenをコピペ'");
    process.exit(1);
}

client.login(token)
    .catch(error => {
     
        console.error('BOTログインに失敗', error);
        process.exit(1);
    });

// --- プロセス終了処理 ---
process.on('SIGINT', () => {
    console.log('Botをシャットダウン');
    client.destroy();
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('Botをシャットダウン');
    client.destroy();
    process.exit(0);
});