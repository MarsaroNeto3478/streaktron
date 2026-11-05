# Referências para o TCC

Artigos e livros por trás das ideias do Strekatron, cada um ligado à parte do projeto que ele
sustenta. Antes de citar, **confira cada referência no Google Scholar ou na base da sua
faculdade**: a lista foi montada de memória pelo Claude, e ano, revista ou página podem ter
algum detalhe errado. Prefira os artigos aos livros populares; os livros servem para contexto.

---

## 1. Psicologia: motivação e gamificação

**Gamificação (o que é, se funciona)**
- Deterding, S.; Dixon, D.; Khaled, R.; Nacke, L. (2011). *From game design elements to gamefulness: defining "gamification".* Proceedings of the 15th International Academic MindTrek Conference. — A definição mais citada de gamificação. Base para dizer o que o Strekatron é.
- Hamari, J.; Koivisto, J.; Sarsa, H. (2014). *Does gamification work? A literature review of empirical studies on gamification.* 47th Hawaii International Conference on System Sciences (HICSS). — Revisão: os efeitos são positivos, mas dependem do contexto e do usuário. Bom para a seção de "trabalhos relacionados".
- Sailer, M.; Hense, J. U.; Mayr, S. K.; Mandl, H. (2017). *How gamification motivates: An experimental study of the effects of specific game design elements on psychological need satisfaction.* Computers in Human Behavior, 69. — Liga elementos específicos (pontos, níveis, quests) às necessidades psicológicas. Ótimo para justificar XP, níveis e quests.

**Motivação intrínseca e extrínseca (por que a gamificação é "leve")**
- Ryan, R. M.; Deci, E. L. (2000). *Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being.* American Psychologist, 55(1). — Teoria da Autodeterminação: autonomia, competência, pertencimento. O "porquê" de o app recompensar sem punir.
- Deci, E. L.; Koestner, R.; Ryan, R. M. (1999). *A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation.* Psychological Bulletin, 125(6). — Recompensas externas podem minar a motivação interna (efeito de superjustificação). Justifica XP que nunca é retirado (D15), recompensas cosméticas e gamificação leve.

**Hábitos**
- Lally, P.; van Jaarsveld, C. H. M.; Potts, H. W. W.; Wardle, J. (2010). *How are habits formed: Modelling habit formation in the real world.* European Journal of Social Psychology, 40(6). — Hábitos levam em média ~66 dias, com grande variação, e **perder um dia não atrapalha a formação**. Sustenta os streaks tolerantes (congelamentos, streak semanal) e o check-in de ontem (D34).
- Wood, W.; Neal, D. T. (2007). *A new look at habits and the habit-goal interface.* Psychological Review, 114(4). — Hábitos são disparados por contexto; útil para falar de agendas por dia da semana.

**Metas, planos e procrastinação**
- Locke, E. A.; Latham, G. P. (2002). *Building a practically useful theory of goal setting and task motivation: A 35-year odyssey.* American Psychologist, 57(9). — Metas específicas e desafiadoras funcionam melhor. Base para metas de resultado e de compromisso e para quests dimensionadas pelos seus próprios dias.
- Gollwitzer, P. M. (1999). *Implementation intentions: Strong effects of simple plans.* American Psychologist, 54(7). — Planos "quando X, faço Y" aumentam a execução. Sustenta "próxima ação", datas agendadas e hábitos com dia definido.
- Steel, P. (2007). *The nature of procrastination: A meta-analytic and theoretical review of quintessential self-regulatory failure.* Psychological Bulletin, 133(1). — Revisão central sobre procrastinação; liga-se aos cinco modos de falha da vision.md.
- Masicampo, E. J.; Baumeister, R. F. (2011). *Consider it done! Plan making can eliminate the cognitive effects of unfulfilled goals.* Journal of Personality and Social Psychology, 101(4). — Fazer um plano alivia a mente de metas pendentes (efeito Zeigarnik). Sustenta a Inbox ("capture agora, organize depois") e a próxima ação.
- Ariely, D.; Wertenbroch, K. (2002). *Procrastination, deadlines, and performance: Self-control by precommitment.* Psychological Science, 13(3). — Prazos autoimpostos ajudam. Base para prazos e contagens regressivas (próxima parte da Fase 4).
- Dai, H.; Milkman, K. L.; Riis, J. (2014). *The fresh start effect: Temporal landmarks motivate aspirational behavior.* Management Science, 60(10). — Começos de semana e de mês motivam recomeços. Sustenta a quest de retorno (comeback), o quadro semanal e a revisão semanal.
- Kivetz, R.; Urminsky, O.; Zheng, Y. (2006). *The goal-gradient hypothesis resurrected.* Journal of Marketing Research, 43(1). — Quanto mais perto da meta, mais esforço. Sustenta as barras de progresso das quests.

**Foco e fluxo**
- Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience.* Harper & Row. (livro) — Estado de fluxo; desafio na medida da habilidade. Base para sessões de foco e quests de tempo dimensionadas.
- Cirillo, F. (2006/2018). *The Pomodoro Technique.* (livro) — Origem dos blocos de 25/5 usados nos presets de foco e nas pausas (D33).

**Loot boxes e o que evitar**
- Zendle, D.; Cairns, P. (2018). *Video game loot boxes are linked to problem gambling: Results of a large-scale survey.* PLoS ONE, 13(11). — Loot boxes pagas se associam a jogo problemático. Justifica a regra "nunca dinheiro real" (D11).

**Organização pessoal (livros de contexto)**
- Allen, D. (2001). *Getting Things Done.* Penguin. — Origem de "inbox", "próxima ação" e revisão semanal.
- Fogg, B. J. (2019). *Tiny Habits.* Houghton Mifflin Harcourt. — Comece pequeno ("pequeno o bastante para um dia ruim", a frase da página Habits).

---

## 2. Tecnologia

**Arquitetura e dados**
- Fowler, M. (2005). *Event Sourcing.* martinfowler.com. — O padrão por trás do log de atividades que só cresce, de onde XP e streaks são calculados (D8).
- Kleppmann, M. (2017). *Designing Data-Intensive Applications.* O'Reilly. (livro) — Logs, consistência, transações; referência geral para a parte de backend.
- Kleppmann, M.; Wiggins, A.; van Hardenberg, P.; McGranaghan, M. (2019). *Local-first software: You own your data, in spite of the cloud.* Onward! 2019 (ACM). — Base para discutir o modo offline (backlog) e o app rodando local e pelo Tailscale (D2).
- Especificação ULID (github.com/ulid/spec). — Os IDs com prefixo (`tsk_`, `hab_`…) que ordenam por tempo.

**Interface e usabilidade**
- Nielsen, J. (1994). *10 Usability Heuristics for User Interface Design.* Nielsen Norman Group (nngroup.com). — Útil para avaliar o app; o caso da quest "Add details" é exemplo da heurística "visibilidade do estado do sistema" e "ajuda o usuário a reconhecer, não lembrar".
- Brooke, J. (1996). *SUS: A "quick and dirty" usability scale.* In: Usability Evaluation in Industry. Taylor & Francis. — Questionário padrão de usabilidade, se o TCC tiver avaliação com usuários.

**Desenvolvimento e testes**
- Beck, K. (2002). *Test-Driven Development: By Example.* Addison-Wesley. (livro) — Contexto para a estratégia de testes (regras de jogo como funções puras com muitos testes).
- Documentação oficial (cite com data de acesso): React, Hono, Drizzle ORM, PostgreSQL, Better Auth, pg-boss, TanStack Router/Query, dnd-kit, TipTap, Vitest; MDN sobre Document Picture-in-Picture API e Notifications API; web.dev sobre Progressive Web Apps; RFC 5545 (iCalendar, RRULE) para os eventos recorrentes da próxima parte.

**Desenvolvimento com IA (se o TCC falar do processo)**
- Peng, S.; Kalliamvakou, E.; Cihon, P.; Demirer, M. (2023). *The impact of AI on developer productivity: Evidence from GitHub Copilot.* arXiv:2302.06590. — Estudo controlado sobre programar com assistente de IA; o diário de bordo (logbook.txt) é o seu próprio material sobre esse processo.

---

## Como isso pode virar a estrutura do TCC (sugestão)

1. **Problema:** os cinco modos de falha de constância (vision.md) → Steel 2007, Masicampo & Baumeister 2011.
2. **Fundamentação:** gamificação (Deterding, Hamari, Sailer) + motivação (Ryan & Deci, Deci et al.) + hábitos (Lally) + metas (Locke & Latham, Gollwitzer).
3. **Decisões de design justificadas pela literatura:** XP nunca retirado, streaks tolerantes, sem dinheiro real, quests dimensionadas → decisions.md.
4. **Arquitetura:** log de eventos, servidor como autoridade, testes → Fowler, Kleppmann.
5. **Processo:** desenvolvimento por fases com IA, registrado no logbook.txt.
6. **Avaliação:** uso real (dogfooding) e, se possível, SUS com alguns colegas.
