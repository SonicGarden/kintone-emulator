handlers/ 以下のアクションのコードで export している関数は loader や action ですが、 remix の流儀にとらわれています。
HTTPの verb 一つに対して関数を一つ export する実装に変えてください。
routes/ 以下の remix のコードで verb によって分岐するようにしてください。
