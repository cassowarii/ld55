#!/usr/bin/python3

import ulvl
import sys

if len(sys.argv) < 2:
    print("usage:", sys.argv[0], "<infiles>")
    sys.exit(1)

screenwidth, screenheight = 8, 8

tilemapping = { 0: 1, 4: 1, 5: 4, 6: 5, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1 }

stonemapping = { 0: 9, 7: 0, 8: 1, 9: 2, 10: 3, 11: 4, 12: 5, 13: 6, 14: 7, 15: 8 }

char_index = 4

print("var levels={")
for filename in sys.argv[1:]:
    m = ulvl.TMX.load(filename)

    w = m.meta['width']
    h = m.meta['height']

    print('\t', filename.replace('.tmx', '').replace('levels/', ''), end=': { ')

    stones = [ ]

    print('map: [', end='')
    start_x = 6
    start_y = 4
    for y in range(h):
        for x in range(w):
            thing = m.layers[0].tiles[y * w + x] - 1
            if thing in stonemapping:
                stones.append({ 'type': stonemapping[thing], 'x': x, 'y': y })
            if thing == char_index:
                start_x = x
                start_y = y

            print("" + str(tilemapping.get(thing, thing)) + ",", end='')
    print('],', end='');

    print('stones: [ ', end='')
    for s in stones:
        print('{ x:' + str(s['x']) + ', y:' + str(s['y']) + ', type:' + str(s['type']) + ' }, ', end='')
    print('],', end='')

    print(' start_x:' + str(start_x) + ', start_y:' + str(start_y), end='');

    print(' },')

print("}")
