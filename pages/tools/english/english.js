// pages/tools/english/english.js 每日英语单词（多单词浏览 + TTS 发音）
//
// 【词库结构 BANK】
//   BANK.easy / BANK.medium / BANK.hard 三个数组，每项形如
//   { w: 单词, p: 音标, m: 释义, e: 例句, et: 例句中文翻译 }
//   想加单词？直接在对应数组里加一行对象就行，其他地方不用改。
//
// 【日期 → 单词的映射】
//   todayWordIdx() 把"今天日期"算成一个哈希值，再对词库长度取余。
//   同一个日期永远得到同一个下标（今天第 3 个、明天第 4 个……），
//   这样"每日单词"每天自动换，但同一天多次打开看到的还是同一个。
//
// 【发音原理】
//   用 InnerAudioContext 播放有道词典的在线发音接口，不需要自己录音频文件。
//   代价是必须在小程序后台把 dict.youdao.com 加入 downloadFile 合法域名。
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const { today, uid } = require('../../../utils/util')

// ============ 词库：单词、音标、释义、例句 ============
// w=word 单词 / p=phonetic 音标 / m=meaning 释义 / e=example 例句 / et=例句中文翻译
// 例句和翻译都是本地数据，不依赖任何外部接口
const BANK = {
  easy: [
    { w: 'apple', p: '/ˈæpl/', m: 'n. 苹果', e: 'An apple a day keeps the doctor away.', et: '一天一苹果，医生远离我。' },
    { w: 'happy', p: '/ˈhæpi/', m: 'adj. 快乐的', e: 'She has a happy smile.', et: '她脸上带着幸福的笑容。' },
    { w: 'water', p: '/ˈwɔːtər/', m: 'n. 水', e: 'Please drink more water.', et: '请多喝水。' },
    { w: 'book', p: '/bʊk/', m: 'n. 书', e: 'I love reading this book.', et: '我喜欢读这本书。' },
    { w: 'friend', p: '/frend/', m: 'n. 朋友', e: 'You are my best friend.', et: '你是我最好的朋友。' },
    { w: 'sun', p: '/sʌn/', m: 'n. 太阳', e: 'The sun is shining.', et: '阳光正灿烂。' },
    { w: 'cat', p: '/kæt/', m: 'n. 猫', e: 'The cat is sleeping.', et: '猫在睡觉。' },
    { w: 'flower', p: '/ˈflaʊər/', m: 'n. 花', e: 'What a beautiful flower!', et: '多美的一朵花啊！' },
    { w: 'music', p: '/ˈmjuːzɪk/', m: 'n. 音乐', e: 'I enjoy listening to music.', et: '我喜欢听音乐。' },
    { w: 'dream', p: '/driːm/', m: 'n. 梦想', e: 'Follow your dream.', et: '追随你的梦想。' },
    { w: 'smile', p: '/smaɪl/', m: 'n. 微笑', e: 'A smile makes everything better.', et: '微笑让一切变得更好。' },
    { w: 'star', p: '/stɑːr/', m: 'n. 星星', e: 'Twinkle, twinkle, little star.', et: '一闪一闪小星星。' },
    { w: 'love', p: '/lʌv/', m: 'v. 爱', e: 'I love you.', et: '我爱你。' },
    { w: 'home', p: '/hoʊm/', m: 'n. 家', e: 'Welcome home.', et: '欢迎回家。' },
    { w: 'moon', p: '/muːn/', m: 'n. 月亮', e: 'The moon is bright tonight.', et: '今晚的月亮很亮。' },
    { w: 'tea', p: '/tiː/', m: 'n. 茶', e: 'A cup of tea please.', et: '请给我来一杯茶。' },
    { w: 'rain', p: '/reɪn/', m: 'n. 雨', e: 'I love rain.', et: '我喜欢下雨。' },
    { w: 'cake', p: '/keɪk/', m: 'n. 蛋糕', e: 'Birthday cake is delicious.', et: '生日蛋糕很好吃。' },
    { w: 'blue', p: '/bluː/', m: 'adj. 蓝色的', e: 'She wears a blue dress.', et: '她穿着一条蓝色的裙子。' },
    { w: 'baby', p: '/ˈbeɪbi/', m: 'n. 宝宝', e: 'The baby is sleeping.', et: '宝宝在睡觉。' },
    { w: 'tree', p: '/triː/', m: 'n. 树', e: 'The tree is very tall.', et: '这棵树很高。' },
    { w: 'milk', p: '/mɪlk/', m: 'n. 牛奶', e: 'I drink milk every morning.', et: '我每天早上喝牛奶。' },
    { w: 'sleep', p: '/sliːp/', m: 'v. 睡觉', e: 'I sleep at 10 pm.', et: '我晚上十点睡觉。' },
    { w: 'read', p: '/riːd/', m: 'v. 读', e: 'I read a book every day.', et: '我每天读一本书。' },
    { w: 'song', p: '/sɔːŋ/', m: 'n. 歌', e: 'Sing me a song.', et: '给我唱首歌吧。' },
    { w: 'bird', p: '/bɜːrd/', m: 'n. 鸟', e: 'A bird is singing.', et: '一只鸟在歌唱。' },
    { w: 'fish', p: '/fɪʃ/', m: 'n. 鱼', e: 'There are many fish in the pond.', et: '池塘里有很多鱼。' },
    { w: 'dog', p: '/dɔːɡ/', m: 'n. 狗', e: 'My dog is cute.', et: '我的狗很可爱。' },
    { w: 'red', p: '/red/', m: 'adj. 红色的', e: 'I love the red color.', et: '我喜欢红色。' },
    { w: 'sky', p: '/skaɪ/', m: 'n. 天空', e: 'The sky is blue today.', et: '今天天空是蓝色的。' },
    { w: 'bread', p: '/bred/', m: 'n. 面包', e: 'I eat bread for breakfast.', et: '我早餐吃面包。' },
    { w: 'orange', p: '/ˈɔːrɪndʒ/', m: 'n. 橙子', e: 'This orange is very sweet.', et: '这个橙子很甜。' },
    { w: 'school', p: '/skuːl/', m: 'n. 学校', e: 'I go to school by bus.', et: '我坐公交车去学校。' },
    { w: 'teacher', p: '/ˈtiːtʃər/', m: 'n. 老师', e: 'Our teacher is very kind.', et: '我们的老师很和善。' },
    { w: 'student', p: '/ˈstuːdnt/', m: 'n. 学生', e: 'She is a good student.', et: '她是个好学生。' },
    { w: 'morning', p: '/ˈmɔːrnɪŋ/', m: 'n. 早上', e: 'Good morning, everyone!', et: '大家早上好！' },
    { w: 'night', p: '/naɪt/', m: 'n. 夜晚', e: 'The night is very quiet.', et: '夜晚非常安静。' },
    { w: 'door', p: '/dɔːr/', m: 'n. 门', e: 'Please close the door.', et: '请把门关上。' },
    { w: 'window', p: '/ˈwɪndoʊ/', m: 'n. 窗户', e: 'Open the window, please.', et: '请打开窗户。' },
    { w: 'table', p: '/ˈteɪbl/', m: 'n. 桌子', e: 'The book is on the table.', et: '书在桌子上。' },
    { w: 'chair', p: '/tʃer/', m: 'n. 椅子', e: 'Sit on the chair, please.', et: '请坐在椅子上。' },
    { w: 'phone', p: '/foʊn/', m: 'n. 手机', e: 'My phone is in my bag.', et: '我的手机在包里。' },
    { w: 'green', p: '/ɡriːn/', m: 'adj. 绿色的', e: 'The leaves turn green in spring.', et: '春天叶子变绿了。' },
    { w: 'yellow', p: '/ˈjeloʊ/', m: 'adj. 黄色的', e: 'She likes yellow flowers.', et: '她喜欢黄色的花。' },
    { w: 'hand', p: '/hænd/', m: 'n. 手', e: 'Raise your hand, please.', et: '请举起你的手。' },
    { w: 'eye', p: '/aɪ/', m: 'n. 眼睛', e: 'She has big bright eyes.', et: '她有一双又大又亮的眼睛。' },
    { w: 'foot', p: '/fʊt/', m: 'n. 脚', e: 'My foot hurts a little.', et: '我的脚有点疼。' },
    { w: 'run', p: '/rʌn/', m: 'v. 跑', e: 'I run every morning.', et: '我每天早晨跑步。' },
    { w: 'walk', p: '/wɔːk/', m: 'v. 走路', e: 'We walk to the park together.', et: '我们一起走路去公园。' },
    { w: 'open', p: '/ˈoʊpən/', m: 'v. 打开', e: 'Open your books, please.', et: '请打开你们的书。' },
    { w: 'close', p: '/kloʊz/', m: 'v. 关闭', e: 'Close the window, please.', et: '请关上窗户。' },
    { w: 'help', p: '/help/', m: 'v. 帮助', e: 'Can you help me?', et: '你能帮我一下吗？' },
    { w: 'work', p: '/wɜːrk/', m: 'v. 工作', e: 'My father works in a bank.', et: '我爸爸在银行工作。' },
    { w: 'play', p: '/pleɪ/', m: 'v. 玩', e: 'The kids play in the yard.', et: '孩子们在院子里玩。' },
    { w: 'want', p: '/wɑːnt/', m: 'v. 想要', e: 'I want a cup of tea.', et: '我想要一杯茶。' },
    { w: 'give', p: '/ɡɪv/', m: 'v. 给', e: 'Please give me a hand.', et: '请帮我一下。' },
    { w: 'take', p: '/teɪk/', m: 'v. 拿；带', e: 'Take an umbrella with you.', et: '带把伞吧。' },
    { w: 'small', p: '/smɔːl/', m: 'adj. 小的', e: 'This shirt is too small.', et: '这件衬衫太小了。' },
    { w: 'big', p: '/bɪɡ/', m: 'adj. 大的', e: 'They live in a big house.', et: '他们住在一栋大房子里。' },
    { w: 'beautiful', p: '/ˈbjuːtɪfl/', m: 'adj. 美丽的', e: 'What a beautiful garden!', et: '多么美丽的花园啊！' },
    { w: 'computer', p: '/kəmˈpjuːtər/', m: 'n. 电脑', e: 'I use a computer at work.', et: '我上班用电脑。' },
    { w: 'weather', p: '/ˈweðər/', m: 'n. 天气', e: 'The weather is nice today.', et: '今天天气很好。' },
    { w: 'money', p: '/ˈmʌni/', m: 'n. 钱', e: 'I save money every month.', et: '我每个月都存钱。' },
    { w: 'city', p: '/ˈsɪti/', m: 'n. 城市', e: 'Shanghai is a big city.', et: '上海是座大城市。' },
    { w: 'letter', p: '/ˈletər/', m: 'n. 信', e: 'I wrote a letter to my friend.', et: '我给朋友写了一封信。' }
  ],
  medium: [
    { w: 'journey', p: '/ˈdʒɜːrni/', m: 'n. 旅程', e: 'Life is a beautiful journey.', et: '人生是一段美丽的旅程。' },
    { w: 'achieve', p: '/əˈtʃiːv/', m: 'v. 达成', e: 'Work hard to achieve your dream.', et: '努力奋斗去实现你的梦想。' },
    { w: 'consider', p: '/kənˈsɪdər/', m: 'v. 考虑', e: 'Please consider my suggestion.', et: '请考虑一下我的建议。' },
    { w: 'improve', p: '/ɪmˈpruːv/', m: 'v. 改善', e: 'Practice every day to improve.', et: '每天练习才能进步。' },
    { w: 'patience', p: '/ˈpeɪʃns/', m: 'n. 耐心', e: 'Patience is a virtue.', et: '耐心是一种美德。' },
    { w: 'discover', p: '/dɪˈskʌvər/', m: 'v. 发现', e: 'Explore the world and discover beauty.', et: '探索世界，发现美好。' },
    { w: 'imagine', p: '/ɪˈmædʒɪn/', m: 'v. 想象', e: 'Imagine a peaceful world.', et: '想象一个和平的世界。' },
    { w: 'confidence', p: '/ˈkɑːnfɪdəns/', m: 'n. 自信', e: 'Speak with confidence.', et: '自信地说话。' },
    { w: 'remember', p: '/rɪˈmembər/', m: 'v. 记住', e: 'Remember to call your mom.', et: '记得给妈妈打电话。' },
    { w: 'promise', p: '/ˈprɑːmɪs/', m: 'n. 承诺', e: 'A promise is a promise.', et: '承诺就是承诺。' },
    { w: 'ordinary', p: '/ˈɔːrdneri/', m: 'adj. 普通的', e: 'Every ordinary day matters.', et: '每一个平凡的日子都很重要。' },
    { w: 'strength', p: '/streŋθ/', m: 'n. 力量', e: 'Find your inner strength.', et: '找到你内心的力量。' },
    { w: 'freedom', p: '/ˈfriːdəm/', m: 'n. 自由', e: 'Freedom is priceless.', et: '自由是无价的。' },
    { w: 'together', p: '/təˈɡeðər/', m: 'adv. 一起', e: 'We can do it together.', et: '我们可以一起做到。' },
    { w: 'realize', p: '/ˈriːəlaɪz/', m: 'v. 意识到', e: 'I realize the importance of time.', et: '我意识到时间的重要性。' },
    { w: 'wonderful', p: '/ˈwʌndərfl/', m: 'adj. 极好的', e: 'What a wonderful day!', et: '多么美好的一天啊！' },
    { w: 'challenge', p: '/ˈtʃælɪndʒ/', m: 'n. 挑战', e: 'Every challenge is a chance.', et: '每一次挑战都是一次机会。' },
    { w: 'success', p: '/səkˈses/', m: 'n. 成功', e: 'Success comes from effort.', et: '成功源于努力。' },
    { w: 'respect', p: '/rɪˈspekt/', m: 'v. 尊重', e: 'Respect yourself and others.', et: '尊重自己，也尊重他人。' },
    { w: 'truth', p: '/truːθ/', m: 'n. 真相', e: 'Tell me the truth.', et: '告诉我真相。' },
    { w: 'brave', p: '/breɪv/', m: 'adj. 勇敢的', e: 'Be brave and try.', et: '勇敢一点，去试试。' },
    { w: 'memory', p: '/ˈmeməri/', m: 'n. 记忆', e: 'What a sweet memory!', et: '多么甜蜜的回忆啊！' },
    { w: 'gentle', p: '/ˈdʒentl/', m: 'adj. 温柔的', e: 'She has a gentle voice.', et: '她的声音很温柔。' },
    { w: 'grateful', p: '/ˈɡreɪtfl/', m: 'adj. 感激的', e: 'Be grateful for what you have.', et: '对你所拥有的心怀感激。' },
    { w: 'peaceful', p: '/ˈpiːsfl/', m: 'adj. 平静的', e: 'A peaceful morning.', et: '一个宁静的早晨。' },
    { w: 'shining', p: '/ˈʃaɪnɪŋ/', m: 'adj. 发光的', e: 'A shining star in the sky.', et: '天空中一颗闪亮的星。' },
    { w: 'courage', p: '/ˈkɜːrɪdʒ/', m: 'n. 勇气', e: 'Have the courage to be yourself.', et: '要有勇气做你自己。' },
    { w: 'wisdom', p: '/ˈwɪzdəm/', m: 'n. 智慧', e: 'Wisdom comes with age.', et: '智慧随年龄增长。' },
    { w: 'happiness', p: '/ˈhæpinəs/', m: 'n. 幸福', e: 'Happiness is a choice.', et: '幸福是一种选择。' },
    { w: 'comfort', p: '/ˈkʌmfərt/', m: 'n. 安慰', e: 'Your words bring comfort.', et: '你的话让人感到安慰。' },
    { w: 'habit', p: '/ˈhæbɪt/', m: 'n. 习惯', e: 'Reading is a good habit.', et: '阅读是个好习惯。' },
    { w: 'quality', p: '/ˈkwɑːləti/', m: 'n. 质量', e: 'Quality matters more than price.', et: '质量比价格更重要。' },
    { w: 'attention', p: '/əˈtenʃn/', m: 'n. 注意力', e: 'Pay attention to the details.', et: '注意细节。' },
    { w: 'ability', p: '/əˈbɪləti/', m: 'n. 能力', e: 'She has the ability to lead.', et: '她有领导能力。' },
    { w: 'benefit', p: '/ˈbenɪfɪt/', m: 'n. 好处', e: 'Exercise has many benefits.', et: '运动有很多好处。' },
    { w: 'compare', p: '/kəmˈper/', m: 'v. 比较', e: 'Do not compare yourself with others.', et: '不要拿自己和别人比较。' },
    { w: 'connect', p: '/kəˈnekt/', m: 'v. 连接', e: 'The bridge connects the two cities.', et: '这座桥连接着两座城市。' },
    { w: 'decision', p: '/dɪˈsɪʒn/', m: 'n. 决定', e: 'It was a hard decision to make.', et: '那是个很难做的决定。' },
    { w: 'effort', p: '/ˈefərt/', m: 'n. 努力', e: 'Success needs time and effort.', et: '成功需要时间和努力。' },
    { w: 'environment', p: '/ɪnˈvaɪrənmənt/', m: 'n. 环境', e: 'We should protect the environment.', et: '我们应该保护环境。' },
    { w: 'express', p: '/ɪkˈspres/', m: 'v. 表达', e: 'Learn to express your feelings.', et: '学会表达你的感受。' },
    { w: 'familiar', p: '/fəˈmɪliər/', m: 'adj. 熟悉的', e: 'This street looks familiar.', et: '这条街看起来很熟悉。' },
    { w: 'generate', p: '/ˈdʒenəreɪt/', m: 'v. 产生', e: 'Solar panels generate electricity.', et: '太阳能板可以发电。' },
    { w: 'honest', p: '/ˈɑːnɪst/', m: 'adj. 诚实的', e: 'Be honest with your friends.', et: '对朋友要诚实。' },
    { w: 'include', p: '/ɪnˈkluːd/', m: 'v. 包含', e: 'The price includes breakfast.', et: '价格包含早餐。' },
    { w: 'knowledge', p: '/ˈnɑːlɪdʒ/', m: 'n. 知识', e: 'Knowledge is power.', et: '知识就是力量。' },
    { w: 'maintain', p: '/meɪnˈteɪn/', m: 'v. 维持', e: 'It is hard to maintain a habit.', et: '坚持一个习惯很难。' },
    { w: 'natural', p: '/ˈnætʃrəl/', m: 'adj. 自然的', e: 'She has a natural smile.', et: '她的笑容很自然。' },
    { w: 'obvious', p: '/ˈɑːbviəs/', m: 'adj. 明显的', e: 'The answer is quite obvious.', et: '答案相当明显。' },
    { w: 'prepare', p: '/prɪˈper/', m: 'v. 准备', e: 'I am preparing for the exam.', et: '我在为考试做准备。' },
    { w: 'protect', p: '/prəˈtekt/', m: 'v. 保护', e: 'Protect your eyes from the sun.', et: '保护眼睛别被太阳晒到。' },
    { w: 'provide', p: '/prəˈvaɪd/', m: 'v. 提供', e: 'The school provides free lunch.', et: '学校提供免费午餐。' },
    { w: 'reduce', p: '/rɪˈduːs/', m: 'v. 减少', e: 'We need to reduce waste.', et: '我们需要减少浪费。' },
    { w: 'reflect', p: '/rɪˈflekt/', m: 'v. 反映；反思', e: 'Take time to reflect on your day.', et: '花点时间反思你的一天。' },
    { w: 'require', p: '/rɪˈkwaɪər/', m: 'v. 需要', e: 'This job requires great patience.', et: '这份工作需要极大的耐心。' },
    { w: 'suggest', p: '/səˈdʒest/', m: 'v. 建议', e: 'I suggest we start early.', et: '我建议我们早点开始。' },
    { w: 'support', p: '/səˈpɔːrt/', m: 'v. 支持', e: 'My family supports my choice.', et: '家人支持我的选择。' },
    { w: 'valuable', p: '/ˈvæljuəbl/', m: 'adj. 宝贵的', e: 'Time is more valuable than money.', et: '时间比金钱更宝贵。' },
    { w: 'opinion', p: '/əˈpɪnjən/', m: 'n. 观点', e: 'Everyone has a different opinion.', et: '每个人都有不同的看法。' },
    { w: 'schedule', p: '/ˈskedʒuːl/', m: 'n. 日程', e: 'My schedule is full today.', et: '我今天日程排满了。' },
    { w: 'balance', p: '/ˈbæləns/', m: 'n. 平衡', e: 'Find a balance between work and life.', et: '在工作与生活之间找到平衡。' },
    { w: 'talent', p: '/ˈtælənt/', m: 'n. 天赋', e: 'She has a talent for music.', et: '她有音乐方面的天赋。' },
    { w: 'avoid', p: '/əˈvɔɪd/', m: 'v. 避免', e: 'Avoid staying up too late.', et: '避免熬夜太晚。' }
  ],
  hard: [
    { w: 'serendipity', p: '/ˌserənˈdɪpəti/', m: 'n. 意外的好运', e: 'Meeting her was pure serendipity.', et: '遇见她纯粹是意外的幸运。' },
    { w: 'ephemeral', p: '/ɪˈfemərəl/', m: 'adj. 短暂的', e: 'Beauty is often ephemeral.', et: '美往往是短暂的。' },
    { w: 'resilient', p: '/rɪˈzɪliənt/', m: 'adj. 有韧性的', e: 'Kids are surprisingly resilient.', et: '孩子们的恢复力出人意料地强。' },
    { w: 'nostalgia', p: '/nɑːˈstældʒə/', m: 'n. 怀旧', e: 'Old photos fill me with nostalgia.', et: '老照片让我满怀怀旧之情。' },
    { w: 'tranquility', p: '/træŋˈkwɪləti/', m: 'n. 宁静', e: 'She longed for tranquility.', et: '她渴望宁静。' },
    { w: 'meticulous', p: '/məˈtɪkjələs/', m: 'adj. 一丝不苟的', e: 'He is meticulous about details.', et: '他对细节一丝不苟。' },
    { w: 'eloquent', p: '/ˈeləkwənt/', m: 'adj. 雄辩的', e: 'She made an eloquent speech.', et: '她发表了一场雄辩的演讲。' },
    { w: 'whimsical', p: '/ˈwɪmzɪkl/', m: 'adj. 异想天开的', e: 'A whimsical story for kids.', et: '一个充满奇思妙想的儿童故事。' },
    { w: 'ambivalent', p: '/æmˈbɪvələnt/', m: 'adj. 矛盾的', e: 'I feel ambivalent about it.', et: '对此我心情矛盾。' },
    { w: 'petrichor', p: '/ˈpetrɪkɔːr/', m: 'n. 雨后泥土的香气', e: 'I love the petrichor after rain.', et: '我喜欢雨后泥土的芬芳。' },
    { w: 'epiphany', p: '/ɪˈpɪfəni/', m: 'n. 顿悟', e: 'I had an epiphany yesterday.', et: '我昨天突然顿悟了。' },
    { w: 'sublime', p: '/səˈblaɪm/', m: 'adj. 崇高的', e: 'The view was simply sublime.', et: '那景色简直壮美至极。' },
    { w: 'quintessential', p: '/ˌkwɪntɪˈsenʃl/', m: 'adj. 典型的', e: 'She is the quintessential teacher.', et: '她是最典型的那种老师。' },
    { w: 'mellifluous', p: '/məˈlɪfluəs/', m: 'adj. 甜美的', e: 'Her mellifluous voice captivated all.', et: '她甜美的嗓音迷住了所有人。' },
    { w: 'ineffable', p: '/ɪnˈefəbl/', m: 'adj. 难以言喻的', e: 'An ineffable joy filled the room.', et: '一种难以言喻的喜悦充满了房间。' },
    { w: 'labyrinthine', p: '/ˌlæbəˈrɪnθaɪn/', m: 'adj. 迷宫般的', e: 'A labyrinthine network of streets.', et: '迷宫般的街道网络。' },
    { w: 'euphoria', p: '/juːˈfɔːriə/', m: 'n. 狂喜', e: 'The news sent her into euphoria.', et: '这个消息让她欣喜若狂。' },
    { w: 'sonder', p: '/ˈsɑːndər/', m: 'n. 陌生人也有生活的感悟', e: 'A moment of sonder in the cafe.', et: '在咖啡馆里的一刻感悟：每个陌生人都有自己的故事。' },
    { w: 'limerence', p: '/ˈlɪmərəns/', m: 'n. 痴迷', e: 'Early stages of love feel like limerence.', et: '爱情初期的感觉就像一种痴迷。' },
    { w: 'halcyon', p: '/ˈhælsiən/', m: 'adj. 平静的', e: 'Halcyon days of summer.', et: '夏日里宁静美好的日子。' },
    { w: 'obfuscate', p: '/ˈɑːbfəskeɪt/', m: 'v. 使模糊', e: 'Don\'t obfuscate the truth.', et: '不要混淆真相。' },
    { w: 'perfunctory', p: '/pərˈfʌŋktəri/', m: 'adj. 敷衍的', e: 'A perfunctory handshake.', et: '一次敷衍的握手。' },
    { w: 'cogitate', p: '/ˈkɑːdʒɪteɪt/', m: 'v. 深思', e: 'Take time to cogitate on it.', et: '花点时间深思这件事。' },
    { w: 'vicissitude', p: '/vɪˈsɪsɪtuːd/', m: 'n. 变迁', e: 'Life\'s vicissitudes teach us much.', et: '人生的变迁教会我们很多。' },
    { w: 'pellucid', p: '/pəˈluːsɪd/', m: 'adj. 清澈的', e: 'A pellucid stream flows down.', et: '一条清澈的溪流向下流淌。' },
    { w: 'sesquipedalian', p: '/ˌseskwɪpɪˈdeɪliən/', m: 'adj. 用长词的', e: 'Avoid sesquipedalian language.', et: '避免使用冗长难懂的词。' },
    { w: 'susurrus', p: '/sʊˈsɜːrəs/', m: 'n. 低语声', e: 'A susurrus of leaves in the wind.', et: '风中树叶的沙沙低语。' },
    { w: 'aubade', p: '/oʊˈbɑːd/', m: 'n. 晨歌', e: 'A sweet aubade at dawn.', et: '黎明时分一首甜美的晨歌。' },
    { w: 'bucolic', p: '/bjuːˈkɑːlɪk/', m: 'adj. 田园的', e: 'A bucolic countryside scene.', et: '一幅田园牧歌般的乡村景象。' },
    { w: 'defenestrate', p: '/diːˈfenɪstreɪt/', m: 'v. 扔出窗外', e: 'An absurd word: defenestrate!', et: '一个荒唐的词：把人扔出窗外！' },
    { w: 'ubiquitous', p: '/juːˈbɪkwɪtəs/', m: 'adj. 无处不在的', e: 'Smartphones are ubiquitous today.', et: '如今智能手机无处不在。' },
    { w: 'esoteric', p: '/ˌesəˈterɪk/', m: 'adj. 深奥难懂的', e: 'The lecture was far too esoteric.', et: '那场讲座实在太过深奥。' },
    { w: 'capricious', p: '/kəˈprɪʃəs/', m: 'adj. 反复无常的', e: 'The weather here is capricious.', et: '这里的天气反复无常。' },
    { w: 'obdurate', p: '/ˈɑːbdərət/', m: 'adj. 固执的', e: 'He remained obdurate despite advice.', et: '尽管有人劝告，他依然固执己见。' },
    { w: 'parsimonious', p: '/ˌpɑːrsɪˈmoʊniəs/', m: 'adj. 吝啬的', e: 'He is parsimonious with praise.', et: '他吝于赞美。' },
    { w: 'sagacious', p: '/səˈɡeɪʃəs/', m: 'adj. 睿智的', e: 'A sagacious leader listens first.', et: '睿智的领导者先倾听。' },
    { w: 'tenacious', p: '/təˈneɪʃəs/', m: 'adj. 顽强的', e: 'She is tenacious in pursuing her goal.', et: '她在追求目标时非常顽强。' },
    { w: 'laconic', p: '/ləˈkɑːnɪk/', m: 'adj. 简洁的', e: 'His reply was short and laconic.', et: '他的回答简短而干脆。' },
    { w: 'garrulous', p: '/ˈɡærələs/', m: 'adj. 喋喋不休的', e: 'A garrulous neighbor kept talking.', et: '一个健谈的邻居说个不停。' },
    { w: 'magnanimous', p: '/mæɡˈnænɪməs/', m: 'adj. 宽宏大量的', e: 'She was magnanimous in victory.', et: '她获胜后表现得宽宏大量。' },
    { w: 'zealous', p: '/ˈzeləs/', m: 'adj. 热心的', e: 'He is a zealous volunteer.', et: '他是一位热心的志愿者。' },
    { w: 'pragmatic', p: '/præɡˈmætɪk/', m: 'adj. 务实的', e: 'We need a pragmatic approach.', et: '我们需要一种务实的做法。' },
    { w: 'aesthetic', p: '/esˈθetɪk/', m: 'adj. 审美的', e: 'The design has real aesthetic value.', et: '这个设计有真正的审美价值。' },
    { w: 'arduous', p: '/ˈɑːrdʒuəs/', m: 'adj. 艰巨的', e: 'The climb was long and arduous.', et: '那次攀登漫长而艰巨。' },
    { w: 'candid', p: '/ˈkændɪd/', m: 'adj. 坦率的', e: 'Give me your candid opinion.', et: '给我你坦率的意见。' },
    { w: 'cogent', p: '/ˈkoʊdʒənt/', m: 'adj. 有说服力的', e: 'She made a cogent argument.', et: '她提出了有力的论证。' },
    { w: 'lucid', p: '/ˈluːsɪd/', m: 'adj. 清晰的', e: 'His explanation was remarkably lucid.', et: '他的解释格外清晰。' },
    { w: 'nuance', p: '/ˈnuːɑːns/', m: 'n. 细微差别', e: 'He caught every nuance of her tone.', et: '他捕捉到了她语气中每一处细微差别。' },
    { w: 'plausible', p: '/ˈplɔːzəbl/', m: 'adj. 看似合理的', e: 'That is a plausible explanation.', et: '那是个看似合理的解释。' },
    { w: 'profound', p: '/prəˈfaʊnd/', m: 'adj. 深刻的', e: 'The book had a profound impact on me.', et: '这本书对我影响深远。' },
    { w: 'redundant', p: '/rɪˈdʌndənt/', m: 'adj. 多余的', e: 'The last sentence is redundant.', et: '最后一句是多余的。' },
    { w: 'skeptical', p: '/ˈskeptɪkl/', m: 'adj. 怀疑的', e: 'I am skeptical about the plan.', et: '我对这个计划持怀疑态度。' },
    { w: 'tedious', p: '/ˈtiːdiəs/', m: 'adj. 乏味的', e: 'The task is tedious but necessary.', et: '这项工作乏味但必要。' },
    { w: 'versatile', p: '/ˈvɜːrsətl/', m: 'adj. 多才多艺的', e: 'She is a versatile artist.', et: '她是位多才多艺的艺术家。' },
    { w: 'vivid', p: '/ˈvɪvɪd/', m: 'adj. 生动的', e: 'He gave a vivid description of the scene.', et: '他对那个场景做了生动的描述。' },
    { w: 'austere', p: '/ɔːˈstɪr/', m: 'adj. 朴素的', e: 'The room was clean but austere.', et: '房间干净却朴素。' },
    { w: 'benevolent', p: '/bəˈnevələnt/', m: 'adj. 仁慈的', e: 'She gave me a benevolent smile.', et: '她对我露出仁慈的微笑。' },
    { w: 'clandestine', p: '/klænˈdestɪn/', m: 'adj. 秘密的', e: 'They held a clandestine meeting.', et: '他们举行了一次秘密会议。' },
    { w: 'pervasive', p: '/pərˈveɪsɪv/', m: 'adj. 弥漫的', e: 'Social media has a pervasive influence.', et: '社交媒体的影响无处不在。' },
    { w: 'immutable', p: '/ɪˈmjuːtəbl/', m: 'adj. 不可改变的', e: 'Some laws of nature are immutable.', et: '有些自然法则是不可改变的。' },
    { w: 'intricate', p: '/ˈɪntrɪkət/', m: 'adj. 错综复杂的', e: 'The carpet has an intricate pattern.', et: '这块地毯有着错综复杂的图案。' },
    { w: 'tranquil', p: '/ˈtræŋkwɪl/', m: 'adj. 宁静的', e: 'We found a tranquil lake at dawn.', et: '我们在黎明时找到一片宁静的湖。' },
    { w: 'solicitous', p: '/səˈlɪsɪtəs/', m: 'adj. 关切的', e: 'A solicitous host checked on every guest.', et: '一位体贴周到的主人照顾着每位客人。' }
  ]
}

const LEVEL_LABEL = { easy: '🌱 简单', medium: '🌿 中等', hard: '🌳 困难' }
const LEVEL_COLOR = { easy: '#5ebfa2', medium: '#6fb7f0', hard: '#a98cd0' }

const DIFF_KEY = 'english_difficulty'
const PROG_KEY = 'english_progress'
const INDEX_KEY = 'english_word_index'   // 当前查看的单词索引（不限每天 1 个）

/**
 * 由日期字符串算出"今天的单词下标"
 *
 * 这是一个简易字符串哈希：
 *   hash = hash * 31 + 当前字符的编码，一路累加
 *   >>> 0 把结果强制转成 32 位无符号整数（防止溢出成负数）
 * 最后 % list.length 落进合法下标范围。
 *
 * 效果：'2026-11-16' 永远算出同一个数字，所以"今天的单词"是稳定的；
 * 换一天字符串变了，下标就变了，于是每天自动换一个词。
 */
function todayWordIdx(list, dateStr) {
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0
  return hash % list.length
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    accent: '#ff8fab',
    speaking: false,       // 是否正在朗读
    voiceType: 'us',       // us 美音 / uk 英音
    todayCount: 0,         // 今日已打卡数量（不限制每天只能背 1 个）
    today: '',
    difficulty: 'easy',
    difficulties: [
      { key: 'easy', name: '简单', color: '#5ebfa2' },
      { key: 'medium', name: '中等', color: '#6fb7f0' },
      { key: 'hard', name: '困难', color: '#a98cd0' }
    ],
    list: [],         // 当前难度的全部单词
    wordIndex: 0,     // 当前单词索引（0 ~ list.length-1）
    current: null,    // 当前单词
    progress: [],
    finished: false,
    levelLabel: '',
    levelColor: ''
  },

  onShow() {
    const diff = wx.getStorageSync(DIFF_KEY) || 'easy'
    const voiceType = wx.getStorageSync('english_voice') || 'us'
    this.setData({ theme: getTheme(), today: today(), difficulty: diff, voiceType })
    applyBg(this)
    this.refresh(true)
  },

  onHide() {
    this._stopAudio()
  },

  onUnload() {
    this._stopAudio()
  },

  /**
   * 重新加载当前难度的数据
   * @param {boolean} initial 首次进入页面传 true：默认停到"今天该背的那个词"
   *                          切换难度 / 上一个下一个时传 false：保留用户浏览到的位置
   */
  refresh(initial) {
    const diff = this.data.difficulty
    const list = BANK[diff]                  // 直接按 key 取数组
    // 每种难度各存一个下标（english_word_index_easy 等），互不干扰
    let idx = wx.getStorageSync(INDEX_KEY + '_' + diff)
    // 下标可能是脏数据（老版本词库更短），越界就重置
    if (typeof idx !== 'number' || idx < 0 || idx >= list.length) {
      idx = initial ? todayWordIdx(list, this.data.today) : 0
    }

    const progress = wx.getStorageSync(PROG_KEY) || []   // 打卡记录
    // 今天这个难度下、当前这个单词是否已经打过卡
    const rec = progress.find(p => p.date === this.data.today && p.level === diff && p.word === list[idx].w)
    // 不限制每日背诵数量：同一天可以打卡任意多个单词
    const todayCount = progress.filter(p => p.date === this.data.today && p.level === diff).length

    // 记一份「今日单词」摘要，首页开启预览时直接展示（不进页面也能看到今天背什么）
    wx.setStorageSync('english_today_word', {
      date: this.data.today,
      w: list[idx].w,
      m: list[idx].m || ''
    })

    this.setData({
      list,
      wordIndex: idx,
      current: list[idx],
      progress: progress.slice().reverse().slice(0, 14),
      finished: !!rec,
      todayCount,
      levelLabel: LEVEL_LABEL[diff],
      levelColor: LEVEL_COLOR[diff]
    })
  },

  selectDifficulty(e) {
    const k = e.currentTarget.dataset.key
    wx.setStorageSync(DIFF_KEY, k)
    this.setData({ difficulty: k })
    this.refresh(false)
  },

  /**
   * 上一个 / 下一个单词
   * 取模 % n 实现"到头绕回"的循环列表：
   *   最后一个的 next → (n-1+1)%n = 0 → 回到第一个
   *   prev 里多写一个 +n 是为了防止 0-1 变成负数（-1 % n 在 JS 里还是 -1）
   */
  prevWord() {
    const n = this.data.list.length
    if (!n) return
    this._showByIndex((this.data.wordIndex - 1 + n) % n)   // +n 防止 0-1 变负数
  },
  nextWord() {
    const n = this.data.list.length
    if (!n) return
    this._showByIndex((this.data.wordIndex + 1) % n)
  },

  /**
   * 显示指定下标的单词（纯本地词库 BANK，不依赖云端）
   * 做的事：写当前下标缓存 + 更新视图 + 同步"今日单词"摘要
   */
  _showByIndex(idx) {
    const list = this.data.list
    const n = list.length
    if (!n) return
    const i = ((idx % n) + n) % n
    const item = list[i]
    // 每个难度各存一个下标，下次进来还停在这里
    wx.setStorageSync(INDEX_KEY + '_' + this.data.difficulty, i)
    // 换词后要重新判断这个词是否已打卡
    const progress = wx.getStorageSync(PROG_KEY) || []
    const rec = progress.find(p => p.date === this.data.today && p.level === this.data.difficulty && p.word === item.w)
    // 首页预览也用这份数据
    wx.setStorageSync('english_today_word', {
      date: this.data.today,
      w: item.w,
      m: item.m || ''
    })
    this.setData({ wordIndex: i, current: item, finished: !!rec })
  },

  /* ============ 语音朗读：点单词/例句直接发音 ============
     实现方式：InnerAudioContext 播放在线 TTS（有道发音接口，无需再复制跳转外部页面）。
     注意：正式发布前需在小程序后台把 https://dict.youdao.com 加入
     「downloadFile 合法域名」；开发者工具里勾选"不校验合法域名"即可直接调试。 */

  _ensureAudio() {
    if (this._audio) return this._audio
    const a = wx.createInnerAudioContext()
    a.obeyMuteSwitch = false
    a.onPlay(() => this.setData({ speaking: true }))
    a.onEnded(() => this.setData({ speaking: false }))
    a.onStop(() => this.setData({ speaking: false }))
    a.onError(() => {
      this.setData({ speaking: false })
      wx.showToast({
        title: '发音失败，可长按单词复制去翻译 App 听',
        icon: 'none',
        duration: 2200
      })
    })
    this._audio = a
    return a
  },

  _stopAudio() {
    if (this._audio) {
      try { this._audio.stop() } catch (e) {}
      this.setData({ speaking: false })
    }
  },

  /**
   * 朗读任意英文文本（单词和例句共用这一个函数）
   *
   * 拼出来的地址是：https://dict.youdao.com/dictvoice?audio=apple&type=2
   *   audio = 要读的英文（必须 encodeURIComponent，否则空格、符号会截断 URL）
   *   type  = 2 美音 / 1 英音
   * 任何一步失败（没网、域名没配置、不支持音频）都退化为"复制到剪贴板"，
   * 让用户自己去翻译 App 里点朗读，总比什么都不发生好。
   */
  speak(text) {
    const t = String(text || '').trim()
    if (!t) return
    if (typeof wx.createInnerAudioContext !== 'function') {
      this._fallbackCopy(t)
      return
    }
    try {
      const a = this._ensureAudio()   // 复用同一个音频实例，避免创建一堆
      a.stop()                        // 先停掉上一次，否则连点会叠着播
      const type = this.data.voiceType === 'uk' ? 1 : 2  // 1 英音 / 2 美音
      a.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(t) + '&type=' + type
      a.play()
    } catch (e) {
      this._fallbackCopy(t)
    }
  },

  _fallbackCopy(text) {
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({
        title: '已复制，粘贴到翻译 App 可听发音 🔊',
        icon: 'none',
        duration: 2200
      })
    })
  },

  /** 点单词本身 / 喇叭按钮 → 直接朗读 */
  speakWord() {
    if (this.data.speaking) { this._stopAudio(); return }
    if (!this.data.current) return
    this.speak(this.data.current.w)
  },

  /** 切换英音 / 美音 */
  toggleVoice() {
    const voiceType = this.data.voiceType === 'us' ? 'uk' : 'us'
    wx.setStorageSync('english_voice', voiceType)
    this.setData({ voiceType })
    wx.showToast({ title: voiceType === 'uk' ? '已切换到英音 🇬🇧' : '已切换到美音 🇺🇸', icon: 'none' })
  },

  /** 长按单词：复制（兜底） */
  copyWord() {
    if (!this.data.current) return
    wx.setClipboardData({ data: this.data.current.w })
  },

  mark(e) {
    const status = e.currentTarget.dataset.s
    const w = this.data.current
    if (!w) return
    const progress = wx.getStorageSync(PROG_KEY) || []
    // 同一天同一难度同一个单词去重
    const filtered = progress.filter(p => !(p.date === this.data.today && p.level === this.data.difficulty && p.word === w.w))
    filtered.push({
      id: uid(),
      date: this.data.today,
      level: this.data.difficulty,
      word: w.w,
      status,
      createdAt: Date.now()
    })
    wx.setStorageSync(PROG_KEY, filtered)
    this.refresh(false)
    wx.showToast({ title: status === 'remembered' ? '已记住 ✨' : '明天再来 💪', icon: 'none' })
  },

  clearProgress() {
    wx.showModal({
      title: '清空学习记录',
      content: '确定清空全部学习打卡记录吗？',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync(PROG_KEY)
          this.refresh(false)
        }
      }
    })
  }
})