#include <assert.h>
#include <stddef.h>
#include <stdio.h>

static int copied_value_after;
static int address_parameter_same_target;

static void addOneWrong(int n) {
    n++;
    copied_value_after = n;
}

static void addOne(int *p) {
    (*p)++;
}

static void addOneObserved(int *p, int *original) {
    address_parameter_same_target = (p == original);
    (*p)++;
}

int main(void) {
    int score = 7;
    addOneWrong(score);
    assert(score == 7 && copied_value_after == 8);
    printf("{\n  \"wrong_call_original\": %d,\n  \"wrong_call_copy\": %d,\n", score, copied_value_after);

    int *p = &score;
    assert(*p == 7);
    printf("  \"score_address\": \"%p\",\n  \"pointer_value\": \"%p\",\n  \"pointer_own_address\": \"%p\",\n", (void *)&score, (void *)p, (void *)&p);
    *p = 8;
    assert(score == 8);
    printf("  \"after_dereference_write\": %d,\n", score);

    int bonus = 20;
    p = &bonus;
    assert(score == 8 && *p == 20);
    *p = 21;
    assert(score == 8 && bonus == 21);
    printf("  \"retarget_score_unchanged\": %d,\n  \"retarget_bonus\": %d,\n", score, bonus);

    score = 7;
    addOneObserved(&score, &score);
    assert(score == 8 && address_parameter_same_target == 1);
    score = 7;
    addOne(&score);
    assert(score == 8);
    printf("  \"correct_call_original\": %d,\n  \"copied_address_same_target\": %s,\n", score, address_parameter_same_target ? "true" : "false");

    int scores[3] = {7, 8, 9};
    p = scores;
    p = p + 1;
    assert(*p == 8 && scores[0] == 7 && scores[1] == 8);
    assert(scores[1] == *(scores + 1));
    int *end = scores + 3;
    assert(end - scores == 3);
    int *empty = NULL;
    assert(empty == NULL);
    printf("  \"sizeof_int_bytes\": %zu,\n  \"sizeof_int_pointer_bytes\": %zu,\n", sizeof(int), sizeof(int *));
    printf("  \"array_addresses\": [\"%p\", \"%p\", \"%p\"],\n", (void *)&scores[0], (void *)&scores[1], (void *)&scores[2]);
    printf("  \"array_values\": [%d, %d, %d],\n  \"p_plus_one_element_offset\": %td,\n  \"p_plus_one_read\": %d,\n", scores[0], scores[1], scores[2], p - scores, *p);
    printf("  \"one_past_offset\": %td,\n  \"unsafe_dereferences_executed\": false,\n  \"all_assertions_passed\": true\n}\n", end - scores);
    return 0;
}
