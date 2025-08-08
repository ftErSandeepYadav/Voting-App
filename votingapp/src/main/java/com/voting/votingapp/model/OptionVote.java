package com.voting.votingapp.model;

import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@Embeddable
public class OptionVote {
    private String voteOption ;
<<<<<<< HEAD
    private Long voteCount = 0L ;
=======
    private Long voteCount = 0L ; // int bhi chalega yrr, faaltu me long use kar liya
>>>>>>> e58cb82 (checking)

}
