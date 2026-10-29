import type { Genre, Level } from '@/lib/constants'

export interface DemoArticle {
  slug: string
  title: string
  level: Level
  topic: string
  genre: Genre
  summaryZh: string
  text: string
}

export const DEMO_ARTICLES: DemoArticle[] = [
  {
    slug: 'night-shift',
    title: "Four O'Clock in the Corridor",
    level: 'gaokao',
    topic: 'the night shift at a hospital',
    genre: 'narrative',
    summaryZh: '夜班护士在走廊里度过凌晨四点，处理水壶、湿外套和一位失眠的病人。',
    text: `The night shift begins long before the city sleeps. At half past ten, the corridor is still full of visitors carrying flowers and plastic cups. By midnight the lifts slow down, the waiting room empties, and the only sound is the low hum of the heating.

The nurse checks the trolley outside room twelve. The kettle there has boiled dry again, so she fills it, sets it back on its stand, and writes a note for the day team. A man in a wet coat asks her where the pharmacy is. She walks him to the end of the corridor, then returns to the desk, where another nurse is handing over a list of patients.

At two, a patient rings for help. His hands are shaking and his paper cup has tipped over. She mops the floor, changes the sheet, and sits with him until his breathing slows. He tells her about the shop he used to run, and she listens, because listening is part of the work.

The corridor grows quiet around four. Rain begins to tap against the windows, a soft drizzle that makes the street below shine. She drinks tea from a chipped mug and watches the cleaners move from room to room. Somewhere on the next floor a monitor beeps, steady as a clock. She has six hours left, but the worst of the night is behind her.

When the first bus passes the hospital gate, the sky is still grey. A woman arrives with a cardboard box of bread for the staff. She takes one, warm through the paper, and stands by the window to eat it. The city is waking up, and her shift is nearly over.`,
  },
  {
    slug: 'tool-library',
    title: 'Borrow a Drill, Return a Story',
    level: 'cet4',
    topic: 'a small library that lends tools',
    genre: 'news',
    summaryZh: '小镇图书馆开始外借工具，会员交押金、参加维修课，也引来五金店的不满。',
    text: `Most libraries lend books. One library in a small town lends something heavier: tools. On a wet Saturday morning, its back room is full of drills, ladders, and garden shears. Members queue with broken lamps and rusty bikes, waiting for a volunteer to find the right part.

The project began three years ago, when a retired carpenter noticed how many useful things people buy once and never use again. He offered his own tools to neighbours. The idea spread, and the library gave the collection a shelf, a lock, and a simple rule: bring it back clean, or stay and help repair it.

Membership costs very little. Borrowers sign a form, leave a small deposit, and receive a tool for a week. The deposit is returned when the tool comes back. If something breaks, the borrower does not pay a fine. Instead, they join a repair session on Thursday evenings, where someone shows them how to fix it.

Not everyone approves. A hardware shop on the high street says the library takes away business. The volunteers answer that most borrowers still buy screws, paint, and new parts. They also point to the shelf of repaired items near the door: a kettle, a fan, two lamps. Every object there has a small card with the name of the person who fixed it.

The library is open for four hours on Saturdays. By noon, the queue has usually gone, and the volunteers drink tea among the ladders. They are tired, but the room feels useful. A child returns a screwdriver and asks to borrow a torch. Someone finds one, checks the battery, and hands it over.`,
  },
  {
    slug: 'puncture',
    title: 'The Puncture',
    level: 'ielts',
    topic: 'a bicycle lane that suddenly ends',
    genre: 'dialogue',
    summaryZh: '两个骑车人在雨后补胎，借工具、找破洞，最后在坡顶互相打趣。',
    text: `The rain had stopped, but the road was still black and shiny. Halfway home, the bicycle began to wobble. The taller rider stopped first, swung a leg over the frame, and pressed a thumb into the back tyre. It sank. "Puncture," she said. "Of course. On the one night I leave the pump at home."

"We can walk it," her neighbour said. "It's only twenty minutes." "It's twenty minutes uphill, and I'm already late." She crouched beside the wheel and ran her fingers along the tread. "There's glass in it. Give me the spanner."

He found the spanner in his bag, along with a small patch, some glue, and a plastic lever. "You carry all this?" she asked. "I used to cycle to work every day," he said. "After the third puncture, I learned." He turned the bike upside down and set it on the grass verge.

Taking the wheel off took a minute. They held the inner tube near their ears, listening for the hiss of air. "There," he said. "Right under the valve." She marked the spot with a pen, roughened the rubber, and spread the glue thinly with her finger.

"You know," she said, "I've had this bike for two years and I've never fixed anything on it." "Now you have," he said. The patch went on. They pushed the tyre back over the rim, pumped it hard, and listened. She clipped the wheel into place, spun it once, and smiled at the sound of the freewheel.

By the time they reached the top of the hill, the streetlights were on. She rode slowly, testing the repair. At her gate, she stopped and said, "Next time, bring two patches." "Next time," he said, "bring your own pump."`,
  },
]
