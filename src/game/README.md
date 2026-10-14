# Структура проекта

```
src/
├── main.ts                  точка входа
├── style.css                страница вокруг игры
├── assets/                  картинки (персонажи, предметы, интерфейс)
└── game/
    ├── config.ts            настройка Phaser и список сцен
    ├── types.ts             общие мелкие типы
    ├── scenes/              экраны игры
    │   ├── BootScene.ts     загрузка картинок и анимаций
    │   └── GameScene.ts     главный экран, склеивает всё вместе
    ├── characters/          классы персонажей
    │   ├── Player.ts        игрок: движение, здоровье
    │   └── Enemy.ts         враг: идёт к игроку
    ├── items/               предметы на поле
    │   └── Coin.ts
    ├── locations/           локации
    │   └── Arena.ts         пол, стены, границы
    ├── systems/             правила игры
    │   ├── EnemyManager.ts  появление и движение врагов
    │   └── CoinSpawner.ts   ровно одна монета на поле
    ├── ui/                  интерфейс
    │   ├── Hud.ts           здоровье и монеты
    │   ├── PauseMenu.ts
    │   ├── GameOverMenu.ts
    │   └── Button.ts
    └── configs/             все числа и настройки
        ├── game.ts          размер экрана, порядок слоёв
        ├── characters.ts    здоровье, скорость, урон
        ├── locations.ts     арена, появление врагов и монет
        ├── assets.ts        ключи картинок и анимаций
        └── ui.ts            цвета и шрифты
```

Правило: числа и настройки лежат в `configs/`, поведение в остальных папках.

Где что менять:
- скорость, здоровье, урон → `configs/characters.ts`
- сколько врагов и как часто появляются → `configs/locations.ts`
- размер арены и цвета → `configs/locations.ts`
- цвета интерфейса → `configs/ui.ts`
- новый враг: запись в `configs/characters.ts` + картинка в `assets/characters/` + загрузка в `BootScene.ts`
