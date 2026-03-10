const emotions = {
  Sad: {
    index: 1,
    description: 'Feeling sorrowful, downhearted, or despondent.',
    color: '#3498db',
    sub_emotions: {
      Lonely: {
        index: 2,
        description: 'Feeling isolated or without companionship.',
        color: '#5dade2',
        sub_sub_emotions: {
          Isolated: { index: 3, description: 'Feeling separated from others.', color: '#85c1e9' },
          Distant: {
            index: 4,
            description: 'Feeling emotionally removed from others.',
            color: '#aed6f1',
          },
        },
      },
      Tired: {
        index: 5,
        description: 'Feeling physically or emotionally drained.',
        color: '#2980b9',
        sub_sub_emotions: {
          Sleepy: { index: 6, description: 'Feeling the need to rest or sleep.', color: '#5499c7' },
          Apathetic: {
            index: 7,
            description: 'Feeling indifferent or lacking motivation.',
            color: '#7fb3d5',
          },
        },
      },
      Guilty: {
        index: 8,
        description: 'Feeling regret or responsibility for a wrongdoing.',
        color: '#1f618d',
        sub_sub_emotions: {
          Ashamed: {
            index: 9,
            description: "Feeling embarrassed or humiliated by one's actions.",
            color: '#2874a6',
          },
          Remorseful: {
            index: 10,
            description: 'Feeling regret or sorrow for a mistake or wrongdoing.',
            color: '#5499c7',
          },
        },
      },
      Depressed: {
        index: 11,
        description: 'Feeling a deep sense of sadness or hopelessness.',
        color: '#154360',
        sub_sub_emotions: {
          Discouraged: {
            index: 12,
            description: 'Feeling a lack of hope or motivation.',
            color: '#1a5276',
          },
          Overwhelmed: {
            index: 13,
            description: 'Feeling emotionally buried or unable to cope.',
            color: '#2980b9',
          },
        },
      },
    },
  },
  Mad: {
    index: 14,
    description: 'Feeling angry, annoyed, or resentful.',
    color: '#e74c3c',
    sub_emotions: {
      Hostile: {
        index: 15,
        description: 'Feeling intense opposition or aggression.',
        color: '#c0392b',
        sub_sub_emotions: {
          Hateful: {
            index: 16,
            description: 'Feeling extreme dislike or animosity.',
            color: '#d35400',
          },
          Jealous: {
            index: 17,
            description: "Feeling envy or resentment toward someone else's success or qualities.",
            color: '#e67e22',
          },
        },
      },
      Irritated: {
        index: 18,
        description: 'Feeling annoyed or bothered by something.',
        color: '#e74c3c',
        sub_sub_emotions: {
          Frustrated: {
            index: 19,
            description: 'Feeling upset due to unmet expectations.',
            color: '#ec7063',
          },
          Sarcastic: {
            index: 20,
            description: 'Using irony or mockery to express discontent.',
            color: '#f1948a',
          },
        },
      },
      Critical: {
        index: 21,
        description: 'Feeling judgmental or overly harsh.',
        color: '#a93226',
        sub_sub_emotions: {
          Skeptical: {
            index: 22,
            description: 'Feeling distrustful or doubtful.',
            color: '#cb4335',
          },
          Dismissive: {
            index: 23,
            description: 'Feeling as though something lacks value or importance.',
            color: '#e74c3c',
          },
        },
      },
    },
  },
  Scared: {
    index: 24,
    description: 'Feeling fearful, uncertain, or uneasy.',
    color: '#f1c40f',
    sub_emotions: {
      Insecure: {
        index: 25,
        description: 'Feeling uncertain or lacking confidence.',
        color: '#f39c12',
        sub_sub_emotions: {
          Inferior: {
            index: 26,
            description: 'Feeling less capable or worthy than others.',
            color: '#f4d03f',
          },
          Stupid: {
            index: 27,
            description: 'Feeling unintelligent or inadequate.',
            color: '#f7dc6f',
          },
        },
      },
      Anxious: {
        index: 28,
        description: 'Feeling worried or uneasy about something.',
        color: '#f1c40f',
        sub_sub_emotions: {
          Helpless: {
            index: 29,
            description: 'Feeling unable to change or influence a situation.',
            color: '#f4d03f',
          },
          Overwhelmed: {
            index: 30,
            description: 'Feeling buried under emotional or mental stress.',
            color: '#f7dc6f',
          },
        },
      },
      Confused: {
        index: 31,
        description: 'Feeling unsure or unable to make sense of something.',
        color: '#f39c12',
        sub_sub_emotions: {
          Bewildered: {
            index: 32,
            description: 'Feeling perplexed or disoriented.',
            color: '#f4d03f',
          },
          Embarrassed: {
            index: 33,
            description: 'Feeling self-conscious or awkward about a mistake.',
            color: '#f7dc6f',
          },
        },
      },
    },
  },
  Joyful: {
    index: 34,
    description: 'Feeling happy, elated, or full of positive energy.',
    color: '#f39c12',
    sub_emotions: {
      Excited: {
        index: 35,
        description: 'Feeling thrilled or enthusiastic about something.',
        color: '#e67e22',
        sub_sub_emotions: {
          Energetic: {
            index: 36,
            description: 'Feeling full of energy and vitality.',
            color: '#f39c12',
          },
          Playful: {
            index: 37,
            description: 'Feeling lighthearted and in a mood for fun.',
            color: '#f5b041',
          },
        },
      },
      Cheerful: {
        index: 38,
        description: 'Feeling bright and happy.',
        color: '#d35400',
        sub_sub_emotions: {
          Amused: {
            index: 39,
            description: 'Finding humor or entertainment in something.',
            color: '#e67e22',
          },
          Optimistic: {
            index: 40,
            description: 'Feeling hopeful and confident about the future.',
            color: '#f39c12',
          },
        },
      },
      Hopeful: {
        index: 41,
        description: 'Feeling a sense of positive expectation.',
        color: '#e67e22',
        sub_sub_emotions: {
          Optimistic: {
            index: 42,
            description: 'Believing that good things are likely to happen.',
            color: '#f39c12',
          },
          Daring: {
            index: 43,
            description: 'Feeling bold and willing to take risks.',
            color: '#f5b041',
          },
        },
      },
    },
  },
  Powerful: {
    index: 44,
    description: 'Feeling confident, accomplished, or in control.',
    color: '#9b59b6',
    sub_emotions: {
      Proud: {
        index: 45,
        description: "Feeling a sense of satisfaction in one's achievements.",
        color: '#8e44ad',
        sub_sub_emotions: {
          Confident: {
            index: 46,
            description: 'Feeling self-assured and capable.',
            color: '#9b59b6',
          },
          Successful: {
            index: 47,
            description: 'Feeling triumphant in reaching goals.',
            color: '#af7ac5',
          },
        },
      },
      Respected: {
        index: 48,
        description: 'Feeling admired or valued by others.',
        color: '#7d3c98',
        sub_sub_emotions: {
          Important: {
            index: 49,
            description: 'Feeling significant and valued.',
            color: '#8e44ad',
          },
          Worthwhile: {
            index: 50,
            description: "Feeling that one's actions or presence have meaning.",
            color: '#9b59b6',
          },
        },
      },
      Hopeful: {
        index: 51,
        description: 'Feeling a sense of optimism or anticipation.',
        color: '#6c3483',
        sub_sub_emotions: {
          Valuable: {
            index: 52,
            description: 'Feeling that one has worth or importance.',
            color: '#7d3c98',
          },
          Optimistic: {
            index: 53,
            description: 'Looking forward to good outcomes.',
            color: '#8e44ad',
          },
        },
      },
    },
  },
  Peaceful: {
    index: 54,
    description: 'Feeling calm, at ease, and harmonious.',
    color: '#1abc9c',
    sub_emotions: {
      Content: {
        index: 55,
        description: 'Feeling satisfied and at ease.',
        color: '#16a085',
        sub_sub_emotions: {
          Relaxed: {
            index: 56,
            description: 'Feeling calm and free from stress.',
            color: '#1abc9c',
          },
          Serene: { index: 57, description: 'Feeling tranquil and untroubled.', color: '#48c9b0' },
        },
      },
      Loving: {
        index: 58,
        description: 'Feeling affection and care for others.',
        color: '#138d75',
        sub_sub_emotions: {
          Trusting: {
            index: 59,
            description: "Feeling secure in one's reliance on others.",
            color: '#16a085',
          },
          Nurturing: {
            index: 60,
            description: 'Feeling a desire to care for and support others.',
            color: '#1abc9c',
          },
        },
      },
      Thoughtful: {
        index: 61,
        description: 'Feeling reflective and considerate.',
        color: '#117a65',
        sub_sub_emotions: {
          Intimate: {
            index: 62,
            description: 'Feeling a close connection with someone.',
            color: '#138d75',
          },
          Pensive: {
            index: 63,
            description: 'Feeling deeply thoughtful or reflective.',
            color: '#16a085',
          },
        },
      },
    },
  },
};

export default emotions;
