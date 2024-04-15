"use strict";

let game;

let game_started = false;

let level_number = 1;

let map;

let intitle;
let wonitall;

/* --------- definitions ---------- */

/* state:
 * STAND: waiting for input
 * MOVE: walking to another square
 * CAST: casting a spell (successfully, i.e. pulling an object)
 * CASTEND: done casting a spell but waiting for the magic to go away
 * WIN: level complete
 */
let State = { STAND: 0, MOVE: 1, CAST: 2, CASTEND: 3, WIN: 4 };

let can_continue = false;

let save_data = 1;
const SAVE_KEY = "casso.lizardwizard.save"

zb.ready(function() {
    game = zb.create_game({
        canvas: 'canvas',
        canvas_w: 800,
        canvas_h: 800,
        draw_scale: 3,
        tile_size: 32,
        level_w: 8,
        level_h: 8,
        background_color: '#36374b',
        draw_func: do_draw,
        update_func: do_update,
        run_in_background: true,
        save_key: SAVE_KEY,
        state: State.STAND,
        events: {
            keydown: handle_keydown,
            keyup: handle_keyup,
            mouseup: handle_mouseup,
            mousedown: handle_mousedown,
            gamestart: handle_gamestart,
        },
    });

    game.register_sfx({
        slide: {
            path: 'sfx/slide.wav',
            volume: 0.75,
        },
        connect: {
            path: 'sfx/connect.wav',
            volume: 0.8,
        },
        disconnect: {
            path: 'sfx/disconnect.wav',
            volume: 0.5,
        },
        win: {
            path: 'sfx/complete.wav',
            volume: 1,
        },
        go: {
            path: 'sfx/go.wav',
            volume: 1,
        },
        step: {
            path: 'sfx/step.wav',
            volume: 0.3,
        },
        step2: {
            path: 'sfx/step2.wav',
            volume: 0.3,
        },
        step3: {
            path: 'sfx/step3.wav',
            volume: 0.3,
        },
    });

    game.register_images({
        character: 'img/lizwiz.png',
        tiles: 'img/tiles.png',
        magic: 'img/magic.png',
        stones: 'img/stones.png',
        beams: 'img/beams.png',
        youdidit: 'img/youdidit.png',
        endscreen: 'img/endscreen.png',
        titlescreen: 'img/titlescreen.png',
        levelimgs: {
             1: 'img/level/1.png',
             2: 'img/level/2.png',
             3: 'img/level/3.png',
             4: 'img/level/4.png',
             5: 'img/level/5.png',
             6: 'img/level/6.png',
             7: 'img/level/7.png',
             8: 'img/level/8.png',
             9: 'img/level/9.png',
            10: 'img/level/10.png',
            11: 'img/level/11.png',
            12: 'img/level/12.png',
            13: 'img/level/13.png',
            14: 'img/level/14.png',
            15: 'img/level/15.png',
        }
    });

    game.register_music({
        magic: {
            path: 'sfx/magic.wav',
            volume: 0.7,
        },
        bgm: {
            path: 'music/spacemagic',
            volume: 0.95,
        },
    });

    game.resources_ready();
});

let ID = {
    lwall: 0,
    floor: 1,
    rwall: 2,
    bothwall: 3,
    gaptop: 4,
    gap: 5,
}

let walkable = {
    [ID.floor]: true,
}

let stoneID = {
    blank: 0,
    leftup: 1,
    rightup: 2,
    leftdown: 3,
    rightdown: 4,
    up: 5,
    right: 6,
    down: 7,
    left: 8,
    blocker: 9,
};

let beamID = {
    leftright: 0,
    updown: 1,
    left: 2,
    down: 3,
    right: 4,
    up: 5,
};

let connect_right_stones = {
    [stoneID.rightup]: true,
    [stoneID.rightdown]: true,
    [stoneID.right]: true,
};

let connect_left_stones = {
    [stoneID.leftup]: true,
    [stoneID.leftdown]: true,
    [stoneID.left]: true,
};

let connect_up_stones = {
    [stoneID.leftup]: true,
    [stoneID.rightup]: true,
    [stoneID.up]: true,
};

let connect_down_stones = {
    [stoneID.leftdown]: true,
    [stoneID.rightdown]: true,
    [stoneID.down]: true,
};

let dirs = {
    down: 0,
    right: 1,
    up: 2,
    left: 3,
};

let MAGIC_DIMENSION = 8;
let MAGIC_TYPES = 24;

/* ------ timers & static timer values --------- */

let CHAR_MOVE_SPEED = 4;
let OBJ_PULL_SPEED = 3.5;

let magic_particle_spawn_timer = 0;
let MAGIC_PARTICLE_SPAWN_GAP = 50;
let MAGIC_PARTICLE_LIFESPAN = 800;
let MAGIC_PARTICLE_LIFESPAN_VARIANCE = 150;

let turn_timer = 0;
let CHANGE_DIRECTION_GAP = 70;

let OBJ_FADE_TIME = 800;

/* ------- game global state -------- */

let character = {};

let objects = [];

let magic_particles = [];

let beams = [];

let arrows = [];
let space_pressed = false;

let cast_target = null;

/* ------- game behavior functions -------- */

function change_anim(object, anim_name) {
    if (object.current_anim !== anim_name) {
        object.current_anim = anim_name;
        object.current_frame = 0;
        object.anim_timer = 0;
    }
}

function complete_char_move(character) {
    if (arrows.length === 0) {
        change_anim(character, 'stand');
        game.state = State.STAND;
        play_step_sound();
    } else {
        check_arrow_inputs();
    }
}

function check_all_stone_connections(playsfx) {
    beams = [];

    for (let o of objects) {
        if (o.is_stone) {
            o.was_already_on = false;
            if (o.frame === 1) {
                o.was_already_on = true;
            }
            o.frame = 0;
        }
    }

    let level_complete = true;
    for (let o of objects) {
        if (o.is_stone) {
            if (o.target_x === o.x && o.target_y === o.y) {
                if (!check_connections(o)) {
                    level_complete = false;
                }
            }
        }
    }

    let connected = false, disconnected = false;
    for (let o of objects) {
        if (!o.was_already_on && o.frame === 1) {
            connected = true;
        }
        if (o.was_already_on && o.frame === 0) {
            disconnected = true;
        }
    }

    if (connected && playsfx) {
        game.sfx.connect.play();
    }
    if (disconnected && playsfx) {
        game.sfx.disconnect.play();
    }

    if (level_complete) {
        win();
    }
}

function complete_stone_pull(stone) {
    if (game.state === State.CAST || space_pressed) {
        attempt_cast();
    } else {
        check_all_stone_connections(true);
    }
}

function check_connections(stone) {
    let friend;
    let found_any = false;
    let missed_any = false;
    let missed = { up: false, down: false, left: false, right: false };
    if (connect_up_stones[stone.variant]) {
        friend = find_stone_friend(stone.x, stone.y, 0, -1);
        if (friend && connect_down_stones[friend.variant]) {
            connect_stones_vert(friend, stone);
            found_any = true;
        } else {
            missed_any = true;
            missed.up = true;
        }
    }
    if (connect_down_stones[stone.variant]) {
        friend = find_stone_friend(stone.x, stone.y, 0, 1);
        if (friend && connect_up_stones[friend.variant]) {
            connect_stones_vert(stone, friend);
            found_any = true;
        } else {
            missed_any = true;
            missed.down = true;
        }
    }
    if (connect_left_stones[stone.variant]) {
        friend = find_stone_friend(stone.x, stone.y, -1, 0);
        if (friend && connect_right_stones[friend.variant]) {
            connect_stones_horiz(friend, stone);
            found_any = true;
        } else {
            missed_any = true;
            missed.left = true;
        }
    }
    if (connect_right_stones[stone.variant]) {
        friend = find_stone_friend(stone.x, stone.y, 1, 0);
        if (friend && connect_left_stones[friend.variant]) {
            connect_stones_horiz(stone, friend);
            found_any = true;
        } else {
            missed_any = true;
            missed.right = true;
        }
    }

    if (found_any && missed_any) {
        if (missed.left) {
            beams.push({
                x: stone.x - 1,
                y: stone.y,
                sprite: {
                    img: game.img.beams,
                    y_offset: 4,
                },
                variant: beamID.right,
            });
        }
        if (missed.right) {
            beams.push({
                x: stone.x + 1,
                y: stone.y,
                sprite: {
                    img: game.img.beams,
                    y_offset: 4,
                },
                variant: beamID.left,
            });
        }
        if (missed.up) {
            beams.push({
                x: stone.x,
                y: stone.y - 1,
                sprite: {
                    img: game.img.beams,
                    y_offset: 4,
                },
                variant: beamID.down,
            });
        }
        if (missed.down) {
            beams.push({
                x: stone.x,
                y: stone.y + 1,
                sprite: {
                    img: game.img.beams,
                    y_offset: 4,
                },
                variant: beamID.up,
            });
        }
    }

    return !missed_any;
}

function find_stone_friend(x, y, dx, dy) {
    let sx = x + dx, sy = y + dy;
    let friend = null;

    do {
        let objs = objs_at(sx, sy);
        for (let o of objs) {
            if (o.is_stone) {
                friend = o;
            }
        }
        sx += dx;
        sy += dy;
    } while (sx >= 0 && sy >= 0 && sx < game.level_w && sy < game.level_h && !friend);

    return friend;
}

function connect_stones_horiz(left_stone, right_stone) {
    if (left_stone.target_x !== left_stone.x || left_stone.target_y !== left_stone.y) return;
    if (right_stone.target_x !== right_stone.x || right_stone.target_y !== right_stone.y) return;
    left_stone.frame = 1;
    right_stone.frame = 1;
    for (let x = left_stone.x + 1; x < right_stone.x; x++) {
        beams.push({
            variant: beamID.leftright,
            sprite: {
                img: game.img.beams,
                y_offset: 4,
            },
            x: x,
            y: left_stone.y,
        });
    }
}

function connect_stones_vert(top_stone, bottom_stone) {
    /*
    let fade_beam = false;
    if (!top_stone.was_already_on) {
        fade_beam = true;
        top_stone.fade = true;
        top_stone.old_frame = 0;
        top_stone.fade_fraction = 0;
    }
    if (!bottom_stone.was_already_on) {
        fade_beam = true;
        bottom_stone.fade = true;
        bottom_stone.old_frame = 0;
        bottom_stone.fade_fraction = 0;
    }
*/
    if (top_stone.target_x !== top_stone.x || top_stone.target_y !== top_stone.y) return;
    if (bottom_stone.target_x !== bottom_stone.x || bottom_stone.target_y !== bottom_stone.y) return;
    top_stone.frame = 1;
    bottom_stone.frame = 1;
    for (let y = top_stone.y + 1; y < bottom_stone.y; y++) {
        beams.push({
            variant: beamID.updown,
            sprite: {
                img: game.img.beams,
                y_offset: 4,
            },
            x: top_stone.x,
            y: y,
        });
    }
}

function start_cast() {
    if (game.state === State.STAND) {
        attempt_cast();
    }
}

function attempt_cast() {
    change_anim(character, 'cast');

    game.state = State.CAST;
    let sdx = 0, sdy = 0;
    switch (character.dir) {
        case dirs.right:
            sdx = 1;
            break;
        case dirs.down:
            sdy = 1;
            break;
        case dirs.left:
            sdx = -1;
            break;
        case dirs.up:
            sdy = -1;
            break;
    }
    let target_x = character.x + sdx;
    let target_y = character.y + sdy;
    let found_obj = null;
    do {
        let objs = objs_at(target_x, target_y);
        for (let o of objs) {
            if (o.pullable) {
                found_obj = objs[0];
            } else if (o.blocks) {
                target_x = 10000;
            }
        }
        target_x += sdx;
        target_y += sdy;
    } while (!found_obj && target_x >= 0 && target_y >= 0 && target_x < game.level_w && target_y < game.level_h);

    if (found_obj && found_obj.pullable) {
        cast_target = found_obj;
        game.music.magic.play();
        let can_move = check_move(cast_target.x, cast_target.y, -sdx, -sdy);
        if (can_move) {
            cast_target.target_x = cast_target.x - sdx;
            cast_target.target_y = cast_target.y - sdy;
            cast_target.move_speed = OBJ_PULL_SPEED;
            cast_target.move_fraction = 0;
            cast_target.completed_move = complete_stone_pull;
            if (cast_target.x - sdx === character.x && cast_target.y - sdy === character.y) {
                cast_target.target_x = cast_target.x;
                cast_target.target_y = cast_target.y;
            } else {
                game.sfx.slide.play();
                create_undo_point();
            }
        }
        check_all_stone_connections(true);
    }
}

function cancel_cast() {
    if (game.state === State.STAND) {
        change_anim(character, 'stand');
    }

    if (game.state === State.CAST) {
        game.state = State.CASTEND;
    }
}

function delete_save() {
    try {
        game.save('level_num', 1);
    } catch (e) {
        console.error("oops, can't save! though that uh... doesn't matter here");
    }
}

function save() {
    try {
        console.log("Saving");
        let save_data = level_number;
        if (game.state === State.WIN) {
            console.log("on next level");
            save_data = level_number + 1;
        }
        game.save('level_num', save_data);
    } catch (e) {
        console.error("oops, can't save!", e);
    }
}

function play_step_sound() {
    // attempted to add this last minute, doesn't work well
    /*let step = Math.floor(Math.random() * 3);
    switch (step) {
        case 0:
            game.sfx.step.play();
            break;
        case 1:
            game.sfx.step2.play();
            break;
        case 2:
            game.sfx.step3.play();
            break;
    }*/
}

function handle_gamestart(game) {
    console.log("Game start!");

    intitle = true;
    wonitall = false;

    character = {
        x: 6,
        y: 6,
        sprite: {
            img: game.img.character,
            w: 40,
            h: 40,
            x_offset: 4,
            y_offset: 8,
        },
        move_speed: CHAR_MOVE_SPEED,
        completed_move: complete_char_move,
        dir: dirs.right,
        current_anim: "stand",
        current_frame: 0,
        anim_timer: 0,
        anims: {
            stand: [ [0, 1000] ],
            walk: [ [1, 150], [0, 150], [2, 150], [0, 150] ],
            cast: [ [3, 1000] ],
        },
    };

    let save_data = parseInt(game.load('level_num') || "1");
    console.log("save data: ", save_data);
    level_number = save_data;
    load_level();
}

function objs_at(x, y) {
    return objects.filter(o => o.x === x && o.y === y);
}

function tile_at(x, y) {
    return map[y * game.level_w + x];
}

let undo_stack = [];

function create_undo_point() {
    let copied_objs = zb.copy_flat_objlist(objects.filter(o => o !== character));

    let undo_point = {
        char_x: character.x,
        char_y: character.y,
        char_dir: character.dir,
        objs: copied_objs,
        beams: zb.copy_flat_objlist(beams),
    }

    undo_stack.push(undo_point);
}

function undo() {
    let undo_point = undo_stack.pop();
    if (!undo_point) return;

    objects = undo_point.objs;
    objects.push(character);

    beams = undo_point.beams;
    character.x = undo_point.char_x;
    character.y = undo_point.char_y;
    character.dir = undo_point.char_dir;
    change_anim(character, "stand");
    can_continue = false;

    for (let o of objects) {
        o.target_x = o.x;
        o.target_y = o.y;
    }

    game.state = State.STAND;
    check_all_stone_connections(false);

    console.log(game.state);
}

function reset() {
    game.start_transition(zb.transition.FADE, 500, function() {
        load_level();
        game.state = State.STAND;
    });
}

function advance_level() {
    if (!can_continue) return;
    console.log("advlevel");
    game.start_transition(zb.transition.SLIDE_DOWN, 750, function() {
        level_number ++;
        load_level();
        can_continue = false;
        character.dir = dirs.right;
        game.state = State.STAND;
    }, function() {
        game.sfx.go.play();
    });
}

function win_everything() {
    game.long_transition(zb.transition.FADE, 1000, function() {
        wonitall = true;
        delete_save();
    });
}

function load_level() {
    if (level_number > Object.keys(levels).length) {
        win_everything();
    } else {
        load_level_data(levels[level_number]);
    }
}

function load_level_data(lvl) {
    undo_stack = [];

    beams = [];

    character.target_x = character.x = lvl.start_x;
    character.target_y = character.y = lvl.start_y;
    character.dir = dirs.right;
    change_anim(character, 'stand');

    game.state = State.STAND;

    map = lvl.map;

    objects = [ character ];

    for (let s of lvl.stones) {
        let stone = {
            x: s.x,
            y: s.y,
            target_x: s.x,
            target_y: s.y,
            move_fraction: 0,
            sprite: {
                img: game.img.stones,
                w: 40,
                h: 40,
                x_offset: 4,
                y_offset: 8,
            },
            variant: s.type,
            pullable: s.type !== stoneID.blocker,
            blocks: s.type === stoneID.blocker,
            is_stone: true,
        };
        objects.push(stone);
    }

    check_all_stone_connections(false);
}

function check_victory() {
    win();
}

function win() {
    console.log("You won!");
    game.state = State.WIN;
    game.music.magic.pause();
    save();
    window.setTimeout(function() {
        game.sfx.win.play();
        can_continue = true;
    }, 350);
}

function check_move(x, y, dx, dy) {
    if (x + dx < 0 || y + dy < 0 || x + dx >= game.level_w || y + dy >= game.level_h) {
        return false;
    }

    if (!walkable[tile_at(x + dx, y + dy)]) {
        return false;
    }

    let blocking_objs = objs_at(x + dx, y + dy);
    if (blocking_objs.length > 0) {
        return false;
    }

    return true;
}

function do_move(dir, dx, dy) {
    if (game.state === State.WIN) return;

    if (character.current_anim === 'cast') return;

    if (dir !== character.dir) {
        turn_timer = 0;
    }

    character.dir = dir;

    if (turn_timer < CHANGE_DIRECTION_GAP) {
        game.state = State.STAND;
        return;
    }

    let can_move = check_move(character.x, character.y, dx, dy);

    if (!can_move) {
        game.state = State.STAND;
        if (character.current_anim === 'walk') {
            play_step_sound();
        }
        change_anim(character, 'stand');
        return;
    }

    create_undo_point();

    character.target_x = character.x + dx;
    character.target_y = character.y + dy;
    character.move_fraction = 0;
    change_anim(character, 'walk');
    game.state = State.MOVE;
}

/* ---------- update functions ------------ */

function check_arrow_inputs() {
    if (arrows.length > 0) {
        switch (arrows[arrows.length - 1]) {
            case dirs.right:
                do_move(dirs.right, 1, 0);
                break;
            case dirs.down:
                do_move(dirs.down, 0, 1);
                break;
            case dirs.left:
                do_move(dirs.left, -1, 0);
                break;
            case dirs.up:
                do_move(dirs.up, 0, -1);
                break;
        }
    } else {
        game.state = State.STAND;
    }
}

/* MAIN UPDATE FUNCTION */
function do_update(delta) {
    turn_timer += delta;

    if (game.state === State.STAND) {
        check_arrow_inputs();
    }

    update_magic_particles(delta);

    for (let o of objects) {
        if (o.current_anim) {
            o.anim_timer += delta;
            while (o.anim_timer > o.anims[o.current_anim][o.current_frame][1]) {
                o.anim_timer -= o.anims[o.current_anim][o.current_frame][1];
                o.current_frame ++;
                o.current_frame = zb.mod(o.current_frame, o.anims[o.current_anim].length);
                if (o === character && o.current_anim === 'walk' && o.anims[o.current_anim][o.current_frame][0] !== 0) {
                    play_step_sound();
                }
            }
        }

        if (o.target_x !== o.x || o.target_y !== o.y) {
            o.move_fraction += o.move_speed * delta / 1000;
            if (o.move_fraction > 1) {
                o.x = o.target_x;
                o.y = o.target_y;
                o.move_fraction = 0;
                o.completed_move(o);
            }
        }
    }

    if (arrows.length === 0 && character.x === character.target_x && character.y === character.target_y && game.state === State.STAND) {
        change_anim(character, 'stand');
    }
}

function update_magic_particles(delta) {
    if (cast_target && (game.state === State.CAST || cast_target.target_x !== cast_target.x || cast_target.target_y !== cast_target.y)) {
        magic_particle_spawn_timer += delta;
        while (magic_particle_spawn_timer > MAGIC_PARTICLE_SPAWN_GAP) {
            magic_particle_spawn_timer -= MAGIC_PARTICLE_SPAWN_GAP;
            let ctx = cast_target.x * game.tile_size * (1 - cast_target.move_fraction) + cast_target.target_x * game.tile_size * cast_target.move_fraction;
            let cty = cast_target.y * game.tile_size * (1 - cast_target.move_fraction) + cast_target.target_y * game.tile_size * cast_target.move_fraction - 3;
            let target_x_offset = 12;
            if (character.dir === dirs.up) {
                target_x_offset = 28;
            }
            magic_particles.push({
                x: ctx + Math.random() * game.tile_size,
                y: cty + Math.random() * game.tile_size,
                target_x: character.x * game.tile_size + target_x_offset - character.sprite.x_offset,
                target_y: character.y * game.tile_size + 19 - character.sprite.y_offset,
                progress: 0,
                lifespan: MAGIC_PARTICLE_LIFESPAN + (Math.random() * 2 - 1) * MAGIC_PARTICLE_LIFESPAN_VARIANCE,
                type: Math.floor(Math.random() * MAGIC_TYPES),
            });
        }
    }

    if (game.state === State.CASTEND) {
        if (!cast_target || cast_target.target_x === cast_target.x && cast_target.target_y === cast_target.y) {
            for (let p of magic_particles) {
                p.lifespan *= 0.92;
            }
        }
    }

    for (let p of magic_particles) {
        p.progress += delta / p.lifespan;
        if (p.progress >= 1) {
            p.deleteme = true;
        }
    }

    magic_particles = magic_particles.filter(p => !p.deleteme);
    if (game.state === State.CASTEND && magic_particles.length === 0) {
        change_anim(character, 'stand');
        cast_target = null;
        game.state = State.STAND;
        game.music.magic.pause();
    }
}

/* ---------- draw functions ----------- */

/* DRAW */
function do_draw(ctx) {
    if (intitle) {
        zb.screen_draw(ctx, game.img.titlescreen);
        return;
    }

    if (wonitall) {
        zb.screen_draw(ctx, game.img.endscreen);
        return;
    }

    ctx.save();
    ctx.translate(5, 5);

    draw_map(ctx);

    if (game.img.levelimgs.hasOwnProperty(level_number)) {
        ctx.save();
        ctx.translate(-5, -5);
        zb.screen_draw(ctx, game.img.levelimgs[level_number]);
        ctx.restore();
    }

    let drawables = zb.copy_list(objects).concat(zb.copy_list(beams));

    drawables.sort((a, b) => {
        let amf = a.move_fraction || 0;
        let bmf = b.move_fraction || 0;
        let aty = a.target_y || 0;
        let bty = b.target_y || 0;
        let ay = Math.max(a.y, aty); /*a.y * (1 - amf) + aty * amf;*/
        let by = b.y * (1 - bmf) + bty * bmf;

        if (ay < by) {
            return -1;
        }
        if (ay > by) {
            return 1;
        }
        if (a === character) {
            return 1;
        }
        if (b === character) {
            return -1;
        }
        return 0;
    });

    for (let d of drawables) {
        if (!d.sprite && !d.img) continue;
        let sprite = d.sprite ? d.sprite.img : d.img;
        let sw = d.sprite ? d.sprite.w || game.tile_size : game.tile_size;
        let sh = d.sprite ? d.sprite.h || game.tile_size : game.tile_size;
        let xo = d.sprite ? d.sprite.x_offset || 0 : 0;
        let yo = d.sprite ? d.sprite.y_offset || 0 : 0;
        let tx = d.target_x !== undefined ? d.target_x : d.x;
        let ty = d.target_y !== undefined ? d.target_y : d.y;
        let mf = d.move_fraction || 0;
        let dir = d.dir || d.variant || 0;
        let frame = d.frame || 0;
        if (d.anims && d.current_anim && d.current_frame !== undefined) {
            frame = d.anims[d.current_anim][d.current_frame][0];
        }

        if (d === character && d.dir === dirs.left) {
            /* we draw magic particles at same time as lizard, before/after lizard depending on whether you're facing left or not.
             * when you're facing left, the wand is behind the lizard's face, so the particles should also go behind. */
            draw_magic_particles(ctx);
        }

        zb.sprite_draw(ctx, sprite, sw, sh, dir, frame,
                    (d.x * (1 - mf) + tx * mf) * game.tile_size - xo, (d.y * (1 - mf) + ty * mf) * game.tile_size - yo);

        if (d === character && d.dir !== dirs.left && d.dir !== dirs.down) {
            draw_magic_particles(ctx);
        }
    }

    if (character.dir === dirs.down) {
        /* If character is facing down, the thing we are pulling gets drawn after us, so draw magic particles at the very end. */
        draw_magic_particles(ctx);
    }

    if (game.state === State.WIN && can_continue) {
        zb.screen_draw(ctx, game.img.youdidit);
    }

    ctx.restore();
}

function draw_magic_particles(ctx) {
    for (let p of magic_particles) {
        let interp = Math.pow(p.progress, 1.5);
        zb.sprite_draw(ctx, game.img.magic, MAGIC_DIMENSION, MAGIC_DIMENSION, p.type, 0,
                    p.x * (1 - interp) + p.target_x * interp - MAGIC_DIMENSION / 2, p.y * (1 - interp) + p.target_y * interp - MAGIC_DIMENSION / 2);
    }
}

function draw_beams(ctx) {
    for (let b of beams) {
        zb.sprite_draw(ctx, game.img.beams, game.tile_size, game.tile_size, b.type, 0, b.x * game.tile_size, b.y * game.tile_size - 4);
    }
}

function draw_map(ctx) {
    for (let y = 0; y < game.level_h; y++) {
        for (let x = 0; x < game.level_w; x++) {
            let tile = map[y * game.level_w + x];
            let variant = (x + y) % 2;
            zb.sprite_draw(ctx, game.img.tiles, game.tile_size, game.tile_size, tile, variant, x * game.tile_size, y * game.tile_size);
        }
    }
}

/* ---------- event handlers ------------ */

let z_presses = 0;
function handle_keydown(game, e) {
    if (wonitall || intitle) return;
    if (e.repeat && e.key !== 'z') return;
    if (game.transition.is_transitioning) return;

    if (game.state === State.WIN && e.key !== 'r' && e.key !== 'z') {
        advance_level();
        return;
    }

    switch (e.key) {
        case 'ArrowRight':
            arrows.push(dirs.right);
            break;
        case 'ArrowDown':
            arrows.push(dirs.down);
            break;
        case 'ArrowLeft':
            arrows.push(dirs.left);
            break;
        case 'ArrowUp':
            arrows.push(dirs.up);
            break;
        case ' ':
            space_pressed = true;
            start_cast();
            break;
        case 'z':
            if (!e.repeat || z_presses % 3 === 0) {
                undo();
            }
            z_presses ++;
            e.preventDefault();
            break;
    }
}

let x_pressed = false;
function handle_keyup(game, e) {
    if (wonitall) return;
    if (game.transition.is_transitioning) return;

    // key up
    switch (e.key) {
        case 'ArrowRight':
            arrows = arrows.filter(a => a !== dirs.right);
            break;
        case 'ArrowDown':
            arrows = arrows.filter(a => a !== dirs.down);
            break;
        case 'ArrowLeft':
            arrows = arrows.filter(a => a !== dirs.left);
            break;
        case 'ArrowUp':
            arrows = arrows.filter(a => a !== dirs.up);
            break;
        case ' ':
            space_pressed = false;
            cancel_cast();
            break;
        case 'm':
            game.toggle_mute();
            e.preventDefault();
            break;
        case 'r':
            reset();
            e.preventDefault();
            break;
        case 'x':
            x_pressed = true;
            break;
        case 'w':
            if (x_pressed) {
                delete_save();
                e.preventDefault();
            }
            break;
    }

    if (e.keyCode !== 88) {
        /* non-X key */
        x_pressed = false;
    }
}

function handle_mousedown(game) {
    // click down
}

function handle_mouseup(game) {
    if (intitle) {
        game.long_transition(zb.transition.FADE, 1000, function() {
            load_level();
            game.music.bgm.play();
            intitle = false;
        });
    }

    if (wonitall) {
        game.long_transition(zb.transition.FADE, 1000, function() {
            wonitall = false;
            level_number = 1;
            intitle = true;
        });
    }
}
