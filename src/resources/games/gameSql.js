export const personalities = [
  {
    type: 'SELECT',
    name: 'The Explorer',
    description: 'Loves to gather information, explore, and learn from the world.',
    motto: 'Show me everything!',
  },
  {
    type: 'INSERT',
    name: 'The Creator',
    description: 'Constantly bringing new ideas or contributions into the mix.',
    motto: 'Add something new.',
  },
  {
    type: 'UPDATE',
    name: 'The Improver',
    description: 'Focused on tweaking and optimizing what already exists.',
    motto: "Let's make it better.",
  },
  {
    type: 'DELETE',
    name: 'The Minimalist',
    description: 'Prefers to remove unnecessary clutter and streamline everything.',
    motto: 'Less is more.',
  },
  {
    type: 'WHERE',
    name: 'The Discerner',
    description: 'Selective, focused on finding what truly matters.',
    motto: 'Filter out the noise.',
  },
  {
    type: 'JOIN',
    name: 'The Collaborator',
    description: 'Loves to connect and find commonalities across different domains.',
    motto: 'Together, we’re stronger.',
  },
  {
    type: 'GROUP BY',
    name: 'The Organizer',
    description: 'Excels at finding patterns and creating order from chaos.',
    motto: "Let's sort things out.",
  },
  {
    type: 'HAVING',
    name: 'The Evaluator',
    description: 'Focused on setting criteria and ensuring standards are met.',
    motto: 'Does it measure up?',
  },
  {
    type: 'ORDER BY',
    name: 'The Prioritizer',
    description: 'Always thinking about the right sequence or hierarchy.',
    motto: 'First things first.',
  },
  {
    type: 'LIMIT',
    name: 'The Realist',
    description: 'Knows when enough is enough and works within constraints.',
    motto: 'Keep it concise.',
  },
];

export const questions = [
  {
    question: "What's your go-to move at a party?",
    options: [
      {
        text: 'I mingle and gather all the juicy gossip.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'I start a dance-off or karaoke session.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'I help improve the playlist to keep the vibes going.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'I clean up the snack table to make space for more food.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'I find a quiet corner to chat with a close friend.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: "I introduce people who don't know each other.",
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'I organize a fun group game.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'I make sure everyone is having a good time.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'I prioritize getting the best seat in the house.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'I set a time limit for my stay and stick to it.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: 'If you were a superhero, what would be your superpower?',
    options: [
      {
        text: 'The ability to find out any secret or hidden information.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'The power to create anything from thin air.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'The skill to upgrade and optimize anything instantly.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'The ability to make things disappear with a snap.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'The knack for seeing through all facades and finding the truth.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'The talent to bring people together for a common cause.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'The power to organize chaos into order.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'The ability to set and maintain high standards.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'The skill to prioritize and manage time perfectly.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'The power to set limits and create boundaries effortlessly.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: "What's your guilty pleasure on a lazy day?",
    options: [
      {
        text: 'Getting lost in a rabbit hole of Wikipedia articles.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Starting a new art or craft project.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'Reorganizing my closet or workspace.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'Cleaning out the fridge and pantry.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'Binge-watching a TV series or movie marathon.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Chatting with friends or family for hours.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'Hosting a virtual game night.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'Planning my next big adventure.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'Making lists of things I want to accomplish.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'Doing absolutely nothing and loving it.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: "What's your secret talent?",
    options: [
      {
        text: 'I can find out anything about anyone.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'I can create something amazing out of nothing.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'I can fix or improve anything I touch.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'I can organize chaos into order.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'I can find the perfect movie or book for any mood.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'I can make friends with anyone, anywhere.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'I can plan the perfect party or event.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'I can set and achieve any goal I set my mind to.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'I can prioritize tasks like a pro.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'I can set boundaries and stick to them.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: "What's your ultimate comfort food?",
    options: [
      {
        text: 'A big bowl of ramen or pho.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Homemade cookies or cake.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'A perfectly grilled cheese sandwich.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'A fresh and colorful salad.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'A hearty stew or soup.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'A big plate of nachos to share.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'A beautifully arranged charcuterie board.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'A meticulously prepared sushi platter.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'A classic burger and fries.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'A simple bowl of ice cream.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: 'How do you deal with a surprise challenge?',
    options: [
      {
        text: 'I gather all the information I can.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'I come up with a creative solution.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'I look for ways to improve the situation.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'I cut out the unnecessary parts to focus on the core issue.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'I focus on finding the most important aspect.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'I collaborate with others to find a solution.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'I organize the steps needed to tackle the challenge.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'I set criteria to evaluate the best approach.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'I prioritize the tasks to handle it efficiently.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'I figure out the constraints and work within them.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: "What's your favorite way to spend a weekend?",
    options: [
      {
        text: 'Exploring new places or learning something new.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Starting a new hobby or project.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'Fixing or improving things around the house.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'Decluttering and organizing your space.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'Finding the best shows or movies to watch.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Hanging out with friends and family.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'Organizing a game night or event.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'Planning your next adventure.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'Making a to-do list for the week.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'Setting limits on your screen time and relaxing.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: 'If you were a flavor of ice cream, what would you be?',
    options: [
      {
        text: 'Mint chocolate chip, refreshing and full of surprises.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Rocky road, adventurous and full of different textures.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'Vanilla bean, classic but always improving.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'Lemon sorbet, light and refreshing, cutting through the clutter.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'Cookies and cream, finding the best mix of flavors.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Neapolitan, bringing together the best of three worlds.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'Strawberry, sweet and organized in layers.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'Pistachio, setting high standards with a unique twist.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'Chocolate fudge, rich and prioritized for taste.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'Salted caramel, balancing sweetness with a pinch of reality.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: "What's your favorite way to start the day?",
    options: [
      {
        text: 'Reading the news or a book to gather new information.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Trying a new recipe for breakfast.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'Reviewing and improving my morning routine.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'Cleaning up and organizing my space.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'Finding a new podcast or show to enjoy.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Catching up with friends or family over coffee.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'Planning a fun activity for later.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'Setting goals and planning my day.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'Making a to-do list for the day.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'Taking a moment to meditate and relax.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
  {
    question: "What's your favorite type of movie?",
    options: [
      {
        text: 'Documentaries, learning something new is always exciting.',
        vector: [0.4, 0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Sci-fi, imagining and creating new worlds.',
        vector: [0.05, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 0.05],
      },
      {
        text: 'Drama, seeing the characters grow and improve.',
        vector: [0.05, 0.1, 0.4, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05, 0.05],
      },
      {
        text: 'Mystery, figuring out the puzzle is thrilling.',
        vector: [0.05, 0.05, 0.1, 0.4, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05],
      },
      {
        text: 'Rom-com, finding the perfect mix of love and laughter.',
        vector: [0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.05, 0.05, 0.05],
      },
      {
        text: 'Family, enjoying a movie with loved ones.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.1, 0.4, 0.05, 0.1, 0.05, 0.05],
      },
      {
        text: 'Action, organizing chaos into thrilling sequences.',
        vector: [0.05, 0.05, 0.1, 0.05, 0.05, 0.05, 0.4, 0.1, 0.05, 0.1],
      },
      {
        text: 'Fantasy, setting high standards in imaginary worlds.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.05, 0.4, 0.1, 0.05],
      },
      {
        text: 'Thriller, prioritizing edge-of-the-seat excitement.',
        vector: [0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.4, 0.1],
      },
      {
        text: 'Short films, enjoying concise and impactful stories.',
        vector: [0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.05, 0.1, 0.4],
      },
    ],
  },
];
