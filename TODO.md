# Feature ideas

1. **Emojified Sealed Envelopes**
   - Add an `emojify` parameter at seal time. When unsealed, the contents should be displayed in an emojified form.

2. **Dead Man's Switch for Sealed Envelopes**
   - Implement a scheduled unseal feature. A user can specify a date/time and a target channel for an envelope to be automatically unsealed.

3. **Prime Number Reactions**
   - The bot should automatically react with a "prime" emoji to any message containing a number that is prime.

4. **Deep Linking in Aggregation**
   - Update the `/aggregate` output to include direct links (URLs) to each individual post within the aggregated results.

5. **Conversation Context Grouping**
   - Enhance `/aggregate` to group nearby messages from the same conversation to preserve context, rather than treating every message as an isolated entry.

6. **The Emphasis Exercise**
   - A command that takes a sentence and outputs it $N$ times (where $N$ is the number of words), with the italics moving to the next word in each subsequent line.

7. **Coin Jars**
   - A database-backed system for "jars" (string names associated with an integer count). Users should be able to list all available jars and increment the count for any jar at any time.

8. **Archeology**
   - Select a random post from the entire history of the given channel and "quote" / link to it
